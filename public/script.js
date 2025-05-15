
let taskData = {};
let currentTaskId = null;
let idCounter = 0;
let activeFilter = null;
let longPressTimer = null;

document.addEventListener("DOMContentLoaded", function () {
    loadTasks();
    updateStatistics();
    toggleSyncMode();
    document.getElementById("taskDetailsForm").addEventListener("submit", function (e) {
        e.preventDefault();
        saveModalData();
        closeModal();
        saveAll();
        updateStatistics();
    });
});

let syncMode = localStorage.getItem("syncMode") === "true";

function toggleSyncMode() {
    syncMode = !syncMode;
    localStorage.setItem("syncMode", syncMode);
    document.getElementById("syncButton").style.display = syncMode ? "inline-block" : "none";
}

async function syncWithCloud() {
    const password = prompt("Mot de passe de synchronisation :");
    if (!password) return;

    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const data = JSON.stringify({
        taskData,
        columns: {
            todo: JSON.parse(localStorage.getItem("todo") || "[]"),
            doing: JSON.parse(localStorage.getItem("doing") || "[]"),
            waiting: JSON.parse(localStorage.getItem("waiting") || "[]"),
            done: JSON.parse(localStorage.getItem("done") || "[]")
        }
    });

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(data)
    );

    const payload = {
        salt: Array.from(salt),
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
    };

    const response = await fetch("http://localhost:3000/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        alert("Synchronisation réussie !");
    } else {
        alert("Erreur lors de la synchronisation");
    }
}
async function loadFromCloud() {
    const password = prompt("Mot de passe de synchronisation :");
    if (!password) return;

    const response = await fetch("http://localhost:3000/api/load");
    const { salt, iv, data } = await response.json();

    const key = await deriveKey(password, new Uint8Array(salt));
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
    );

    const json = JSON.parse(new TextDecoder().decode(decrypted));
    taskData = json.taskData;
    localStorage.setItem("todo", JSON.stringify(json.columns.todo));
    localStorage.setItem("doing", JSON.stringify(json.columns.doing));
    localStorage.setItem("waiting", JSON.stringify(json.columns.waiting));
    localStorage.setItem("done", JSON.stringify(json.columns.done));

    ["todoList", "doingList", "waitingList", "doneList"].forEach(id => {
        document.getElementById(id).innerHTML = "";
    });

    loadTasks();
    updateStatistics();
    alert("Chargement depuis le cloud terminé !");
}


function loadTasks() {
    const columns = ["todo", "doing", "waiting", "done"];
    let maxId = 0;
    columns.forEach(columnId => {
        const savedTasks = JSON.parse(localStorage.getItem(columnId)) || [];
        savedTasks.forEach(task => {
            createTask(task.text, columnId, task.date, task.description, task.address, task.type, task.id, task.time || 0, task.contact || "");
            const taskNum = parseInt(task.id?.replace("task-", ""));
            if (!isNaN(taskNum) && taskNum >= maxId) {
                maxId = taskNum + 1;
            }
        });
    });
    idCounter = maxId;
}

function addTask() {
    const text = document.getElementById("taskInput").value.trim();
    if (text) {
        const columnId = "todo";
        const date = new Date().toISOString();
        createTask(text, columnId, date);
        document.getElementById("taskInput").value = "";
        saveAll();
        updateStatistics();
    }
}

function createTask(text, columnId, date, description = "", address = "", type = "neutre", existingId = null, time = 0, email = "", phone = "") {
    const task = document.createElement("div");
    const id = existingId || "task-" + (idCounter++);
    task.className = "task";
    task.draggable = true;
    task.id = id;
    task.ondragstart = drag;
    task.onclick = () => showModal(id);

    // Texte avec édition inline
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    textSpan.style.cursor = "text";

    textSpan.oncontextmenu = function (e) {
        e.preventDefault(); // Empêche le menu contextuel par défaut
        e.stopPropagation(); // Empêche l'ouverture du modal
        const input = document.createElement("input");
        input.type = "text";
        input.value = textSpan.textContent;
        input.style.width = "100%";

        function validateEdit() {
            const newText = input.value.trim();
            if (newText) {
                textSpan.textContent = newText;
                taskData[task.id].text = newText;
                saveAll();
            }
            input.replaceWith(textSpan);
        }

        input.onblur = validateEdit;

        input.onkeydown = function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                validateEdit();
            }
        };

        textSpan.replaceWith(input);
        input.focus();
    };

    task.appendChild(textSpan);

    const typeBadge = document.createElement("span");
    typeBadge.className = "type-badge type-" + type;
    typeBadge.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    task.appendChild(typeBadge);

    document.getElementById(columnId + "List").appendChild(task);
    taskData[id] = { text, date, description, address, type, time, email, phone, id };

    enableTouchDrag(task); // Active le drag mobile
}

function showModal(taskId) {
    currentTaskId = taskId;
    const data = taskData[taskId];
    if (!data) return;
    document.getElementById("modal-text").value = data.text;
    document.getElementById("modal-desc").value = data.description || "";
    document.getElementById("modal-address").value = data.address || "";
    document.getElementById("modal-email").value = data.email || "";
    document.getElementById("modal-phone").value = data.phone || "";
    document.getElementById("modal-type").value = data.type || "neutre";
    document.getElementById("modal-date").value = new Date(data.date).toLocaleString();
    document.getElementById("modal-time").value = data.time || 0;
    document.getElementById("taskModal").style.display = "block";
}

function saveModalData() {
    const data = taskData[currentTaskId];
    if (!data) return;
    data.text = document.getElementById("modal-text").value.trim();
    data.description = document.getElementById("modal-desc").value.trim();
    data.address = document.getElementById("modal-address").value.trim();
    data.email = document.getElementById("modal-email").value.trim();
    data.phone = document.getElementById("modal-phone").value.trim();
    data.type = document.getElementById("modal-type").value;
    data.time = parseFloat(document.getElementById("modal-time").value) || 0;

    const task = document.getElementById(currentTaskId);
    const spans = task.querySelectorAll("span");
    spans[0].textContent = data.text;
    spans[1].className = "type-badge type-" + data.type;
    spans[1].textContent = data.type.charAt(0).toUpperCase() + data.type.slice(1);
}

function closeModal() {
    document.getElementById("taskModal").style.display = "none";
}

function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text/plain", ev.target.id);
}

function drop(ev) {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text/plain");
    const task = document.getElementById(taskId);
    const targetList = ev.target.closest(".task-list");
    if (task && targetList) {
        targetList.appendChild(task);
        saveAll();
        updateStatistics();
    }
}

function saveAll() {
    ["todo", "doing", "waiting", "done"].forEach(columnId => {
        const column = document.getElementById(columnId + "List");
        const tasks = Array.from(column.children);
        const data = tasks.map(task => taskData[task.id]);
        localStorage.setItem(columnId, JSON.stringify(data));
    });
}

function updateStatistics() {
    const counts = {
        todo: document.getElementById("todoList").children.length,
        doing: document.getElementById("doingList").children.length,
        waiting: document.getElementById("waitingList").children.length,
        done: document.getElementById("doneList").children.length
    };

    document.getElementById("totalCount").textContent = counts.todo + counts.doing + counts.waiting + counts.done;
    document.getElementById("todoCounter").textContent = counts.todo;
    document.getElementById("doingCounter").textContent = counts.doing;
    document.getElementById("doneCounter").textContent = counts.done;

    const typeCounts = { commercial: 0, essais: 0, sav: 0, livraison: 0, neutre: 0 };

    Object.values(taskData).forEach(task => {
        typeCounts[task.type]++;
    });

    const totalTasks = counts.todo + counts.doing + counts.waiting + counts.done;
    const typeBar = document.getElementById("typeBar");
    typeBar.innerHTML = "";

    Object.keys(typeCounts).forEach(type => {
        const bar = document.createElement("div");
        bar.style.width = (typeCounts[type] / totalTasks) * 100 + "%";
        bar.className = "bar " + type;
        bar.title = type.charAt(0).toUpperCase() + type.slice(1) + " (" + typeCounts[type] + ")";
        bar.onclick = () => filterByType(type);
        typeBar.appendChild(bar);
    });

    let totalTime = 0;
    Object.values(taskData).forEach(task => {
        const el = document.getElementById(task.id);
        if (document.getElementById("todoList").contains(el)) {
            totalTime += parseFloat(task.time) || 0;
        }
    });
    document.getElementById("todoTimeTotal").textContent = totalTime.toFixed(2);
}

function filterByType(type) {
    if (activeFilter === type) {
        activeFilter = null;
        Object.values(taskData).forEach(task => {
            const taskElement = document.getElementById(task.id);
            taskElement.style.display = "block";
        });
        document.querySelectorAll('.bar').forEach(bar => {
            bar.classList.remove('selected');
        });
    } else {
        activeFilter = type;
        Object.values(taskData).forEach(task => {
            const taskElement = document.getElementById(task.id);
            taskElement.style.display = (task.type === type) ? "block" : "none";
        });
        document.querySelectorAll('.bar').forEach(bar => {
            bar.classList.remove('selected');
        });
        document.querySelector(`.bar.${type}`).classList.add('selected');
    }
}

function deleteTaskFromModal() {
    if (currentTaskId && taskData[currentTaskId]) {
        if (confirm("Supprimer cette tâche ?")) {
            const task = document.getElementById(currentTaskId);
            if (task) task.remove();
            delete taskData[currentTaskId];
            saveAll();
            updateStatistics();
            closeModal();
        }
    }
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function printModalContent() {
    const data = taskData[currentTaskId];
    if (!data) return;

    const printWindow = window.open('', '_blank');
    const htmlContent = `
    <html>
    <head>
      <title>Impression Kambinou</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        p { margin: 10px 0; }
	pre { font-size: large; }
        strong { display: inline-block; width: 150px; }
      </style>
    </head>
    <body>
      <h2>${escapeHTML(data.text)}</h2>
      <p><strong>Description :</strong><br><pre>${escapeHTML(data.description)}</pre></p>
      <p><strong>Adresse :</strong> ${escapeHTML(data.address)}</p>
      <p><strong>Email :</strong> ${escapeHTML(data.email)}</p>
      <p><strong>Téléphone :</strong> ${escapeHTML(data.phone)}</p>
      <p><strong>Type :</strong> ${escapeHTML(data.type)}</p>
      <p><strong>Date de création :</strong> ${new Date(data.date).toLocaleString()}</p>
     <script>
        window.onload = function() {
          setTimeout(() => {
            window.print();
            window.onafterprint = () => window.close();
          }, 300);
        };
      <\/script>
    </body>
    </html>
  `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

// Export avec mot de passe
function promptExport() {
    const password = prompt("Mot de passe pour chiffrer les données :");
    if (!password) return;
    exportTasksEncrypted(password);
}

async function exportTasksEncrypted(password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(password, salt);
    const data = JSON.stringify({
        taskData,
        columns: {
            todo: JSON.parse(localStorage.getItem("todo") || "[]"),
            doing: JSON.parse(localStorage.getItem("doing") || "[]"),
            waiting: JSON.parse(localStorage.getItem("waiting") || "[]"),
            done: JSON.parse(localStorage.getItem("done") || "[]")
        }
    });

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(data)
    );

    const blob = new Blob([salt, iv, new Uint8Array(encrypted)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kanbinou-sauvegarde.secure";
    a.click();
    URL.revokeObjectURL(url);
}

// Import chiffré
function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const password = prompt("Mot de passe pour déchiffrer les données :");
    if (!password) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const buffer = e.target.result;
        const salt = new Uint8Array(buffer.slice(0, 16));
        const iv = new Uint8Array(buffer.slice(16, 28));
        const data = new Uint8Array(buffer.slice(28));

        try {
            const key = await deriveKey(password, salt);
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                key,
                data
            );

            const json = JSON.parse(new TextDecoder().decode(decrypted));
            if (!json.taskData || !json.columns) throw new Error("Fichier invalide.");

            localStorage.setItem("todo", JSON.stringify(json.columns.todo));
            localStorage.setItem("doing", JSON.stringify(json.columns.doing));
            localStorage.setItem("waiting", JSON.stringify(json.columns.waiting));
            localStorage.setItem("done", JSON.stringify(json.columns.done));
            taskData = json.taskData;

            // Nettoyer et recharger
            ["todoList", "doingList", "waitingList", "doneList"].forEach(id => {
                document.getElementById(id).innerHTML = "";
            });

            loadTasks();
            updateStatistics();
            alert("Importation réussie !");
        } catch (err) {
            alert("Erreur : " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Clé dérivée à partir du mot de passe
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Fonction pour activer le drag and drop sur mobile
function enableTouchDrag(task) {
    let startX, startY;

    task.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;

        longPressTimer = setTimeout(() => {
            task.classList.add("dragging-mobile");
            task.style.position = "absolute";
            task.style.zIndex = 1000;
            moveAt(touch.pageX, touch.pageY);
        }, 500); // 500ms pour considérer un appui long

        function moveAt(x, y) {
            task.style.left = x - task.offsetWidth / 2 + "px";
            task.style.top = y - task.offsetHeight / 2 + "px";
        }

        function onTouchMove(e) {
            const moveTouch = e.touches[0];
            moveAt(moveTouch.pageX, moveTouch.pageY);
        }

        function onTouchEnd(e) {
            clearTimeout(longPressTimer);

            if (task.classList.contains("dragging-mobile")) {
                task.classList.remove("dragging-mobile");
                task.style.position = "";
                task.style.left = "";
                task.style.top = "";
                task.style.zIndex = "";

                const touch = e.changedTouches[0];
                const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
                const column = dropTarget?.closest(".task-list");

                if (column) {
                    column.appendChild(task);
                    saveAll();
                    updateStatistics();
                }
            }

            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
        }

        document.addEventListener("touchmove", onTouchMove);
        document.addEventListener("touchend", onTouchEnd);
    });

    task.addEventListener("touchend", function () {
        clearTimeout(longPressTimer);
    });
}

// Fonction pour télécharger le fichier ICS (calendrier)
function downloadICS(taskId) {
    const task = taskData[taskId];
    if (!task) return;
  
    const start = new Date();
    const end = new Date(start.getTime() + (parseFloat(start) || 1) * 60 * 60 * 1000); // durée en heures
  
    const pad = (num) => String(num).padStart(2, '0');
  
    function toICSDate(date) {
      return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
    }
  
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kanbinou//EN",
      "BEGIN:VEVENT",
      `UID:${task.id}@kanbinou`,
      `DTSTAMP:${toICSDate(new Date())}`,
      `DTSTART:${toICSDate(start)}`,
      `DTEND:${toICSDate(end)}`,
      `SUMMARY:${task.text}`,
      `DESCRIPTION:${task.description || ''}`,
      `LOCATION:${task.address || ''}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
  
    const a = document.createElement("a");
    a.href = url;
    a.download = `${task.text}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
