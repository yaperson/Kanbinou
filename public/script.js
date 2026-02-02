
let taskData = {};
let currentTaskId = null;
let idCounter = 0;
let activeFilter = null;
let longPressTimer = null;

let roadMapButton = document.getElementById("roadMapButton");
let kanbanButton = document.getElementById("kanbanButton");
    
roadMapButton.style.background = "none";
kanbanButton.style.background = "#e1f4ff";

// TODO
let products = JSON.parse(localStorage.getItem("products")) || [
    { id: "prod-1", name: "produit test" }
];

document.addEventListener("DOMContentLoaded", function () {
    loadTasks();
    updateStatistics();
    // toggleSyncMode();
    searchBar();
    document.getElementById("taskDetailsForm").addEventListener("submit", function (e) {
        e.preventDefault();
        saveModalData();
        closeModal();
        saveAll();
        updateStatistics();
    });
});

let syncMode = localStorage.getItem("syncMode") === "true";

// function toggleSyncMode() {
//     syncMode = !syncMode;
//     localStorage.setItem("syncMode", syncMode);
//     document.getElementById("syncButton").style.display = syncMode ? "inline-block" : "none";
// }

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
            createTask(
                task.text,
                columnId,
                task.date,
                task.description,
                task.projection,
                task.sold,
                task.address,
                task.type,
                task.id,
                task.time || 0,
                task.email || "",
                task.phone || "",
                task.products || [],
                task.start || "", 
                task.end || "" // <-- produits récupérés
            );

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

function createTask(text, columnId, date, description = "", projection ="", sold = false, address = "", type = "neutre", existingId = null, time = 0, email = "", phone = "", products = [], start = "", end = "") {
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
    // taskData[id] = { text, date, description, projection, sold, address, type, time, email, phone, id };
    taskData[id] = {
        text, date, description, projection, sold, address,
        type, time, email, phone, id,
        products,
        start,
        end
    };

    enableTouchDrag(task); // Active le drag mobile
}

function showModal(taskId) {
    currentTaskId = taskId;
    const data = taskData[taskId];
    if (!data) return;

    document.getElementById("taskModal").style.display = "block";

    // Remplir la liste AVANT de mettre la valeur   
    populateProductList();  

    document.getElementById("modal-text").value = data.text;
    document.getElementById("modal-desc").value = data.description || "";
    document.getElementById("modal-projection").value = data.projection || "";
    document.getElementById("modal-sold").checked = data.sold || false;
    document.getElementById("modal-address").value = data.address || "";
    document.getElementById("modal-email").value = data.email || "";
    document.getElementById("modal-phone").value = data.phone || "";
    document.getElementById("modal-type").value = data.type || "neutre";
    document.getElementById("modal-date").value = new Date(data.date).toLocaleString();
    document.getElementById("modal-time").value = data.time || 0;

    document.getElementById("modal-product").value = data.products || "";
    document.getElementById("modal-start").value = data.start || "";
    document.getElementById("modal-end").value = data.end || "";
}

function saveModalData() {
    const data = taskData[currentTaskId];
    if (!data) return;

    console.log(data)

    data.text = document.getElementById("modal-text").value.trim();
    data.description = document.getElementById("modal-desc").value.trim();
    data.projection = parseFloat(document.getElementById("modal-projection").value) || 0;

    data.sold = document.getElementById("modal-sold").checked;
    data.address = document.getElementById("modal-address").value.trim();
    data.email = document.getElementById("modal-email").value.trim();
    data.phone = document.getElementById("modal-phone").value.trim();
    data.type = document.getElementById("modal-type").value;
    data.time = parseFloat(document.getElementById("modal-time").value) || 0;

    data.products = document.getElementById("modal-product").value;
    data.start = document.getElementById("modal-start").value;
    data.end = document.getElementById("modal-end").value;


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

// SearchBar with datalist element
function searchBar() {
    const datalist = document.getElementById('search_task');
    const searchBar = document.getElementById('searchBar');

    // Nettoyage du datalist
    datalist.innerHTML = "";

    // Remplir le datalist avec toutes les tâches
    const uniqueTexts = new Set();
    Object.values(taskData).forEach(task => {
        if (!uniqueTexts.has(task.text)) {
            uniqueTexts.add(task.text);
            let option = document.createElement("option");
            option.value = task.text;
            datalist.appendChild(option);
        }
    });

    searchBar.addEventListener('keyup', () => {
        const searchValue = searchBar.value.toLowerCase().trim();

        Object.values(taskData).forEach(task => {
            const taskElement = document.getElementById(task.id);
            if (!taskElement) return;

            // On affiche la tâche si le texte contient la valeur cherchée
            if (task.text.toLowerCase().includes(searchValue)) {
                taskElement.style.display = "block";
            } else {
                taskElement.style.display = "none";
            }
        });
    });
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
      <p><strong>Projection :</strong> ${escapeHTML(data.projection)}€</p>
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
        },
        products
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
            JSON.stringify(json.columns.waiting) ? localStorage.setItem("waiting", JSON.stringify(json.columns.waiting)) : localStorage.setItem("waiting", []);
            localStorage.setItem("done", JSON.stringify(json.columns.done));
            taskData = json.taskData;

            JSON.stringify(json.products) ? localStorage.setItem("products", JSON.stringify(json.products)) : localStorage.setItem("products", []);

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

/**
 * Export CSV
 */

function confirmCSVExport() {
    // Colonnes
    const colCheckboxes = [...document.querySelectorAll(".csv-column:checked")];
    const selectedColumns = colCheckboxes.map(cb => cb.value);

    // Types
    const typeCheckboxes = [...document.querySelectorAll(".csv-type:checked")];
    const selectedTypes = typeCheckboxes.map(cb => cb.value);

    // Toggle années / date
    const isDateMode = document.getElementById("csv-date-toggle").checked;

    let dateFrom = null, dateTo = null, selectedYears = [];

    if (isDateMode) {
        // Mode DATE
        dateFrom = document.getElementById("csv-date-from").value || null;
        dateTo = document.getElementById("csv-date-to").value || null;
    } else {
        // Mode ANNÉE
        let years = document.getElementById("csv-year-filter").value.trim();
        selectedYears = years
            ? years.split(",").map(y => y.trim()).filter(y => /^\d{4}$/.test(y))
            : [];
    }

    exportCSV(selectedColumns, selectedTypes, dateFrom, dateTo, selectedYears);
    closeCSVExport();
}

function exportCSV(columns = [], types = [], dateFrom = null, dateTo = null, years = []) {
    const exportAllColumns = columns.length === 0;
    const exportAllTypes = types.length === 0;
    const filterByDateRange = dateFrom || dateTo;
    const filterByYears = years.length > 0;
    // Is Sold
    const soldFilter = document.querySelector('input[name="csv-sold-filter"]:checked')?.value || "all";

    let rows = [
        ["ID", "Texte", "Description","Projection (€)", "vendu", "Adresse", "Email", "Téléphone", "Type", "Colonne", "Date", "Temps (h)"]
    ];

    const columnLists = {
        todo: document.getElementById("todoList"),
        doing: document.getElementById("doingList"),
        waiting: document.getElementById("waitingList"),
        done: document.getElementById("doneList")
    };

    for (let colName in columnLists) {
        if (!exportAllColumns && !columns.includes(colName)) continue;

        const tasksInColumn = [...columnLists[colName].children];

        tasksInColumn.forEach(el => {
            const t = taskData[el.id];
            if (!t) return;

            // Filtre par type
            if (!exportAllTypes && !types.includes(t.type)) return;

            // Date de création → Date JS
            const taskDate = new Date(t.date);

            // Filtre par plage de dates
            if (filterByDateRange) {
                if (dateFrom && taskDate < new Date(dateFrom)) return;
                if (dateTo && taskDate > new Date(dateTo + "T23:59:59")) return;
            }

            // Filtre par années
            if (filterByYears && !years.includes(String(taskDate.getFullYear()))) {
                return;
            }

            // filtre par vente
            if (soldFilter === "sold" && !t.sold) return;
            if (soldFilter === "not-sold" && t.sold) return;

            rows.push([
                t.id,
                t.text,
                t.description || "",
                t.projection,
                t.sold ? "Oui" : "Non",
                t.address || "",
                t.email || "",
                t.phone || "",
                t.type,
                colName,
                taskDate.toLocaleString(),
                t.time || 0
            ]);
        });
    }

    // Construction CSV
    const csvContent = rows
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"))
        .join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "kanbinou_export.csv";
    a.click();

    URL.revokeObjectURL(url);
}

function openCSVExport() {
    document.getElementById("csvExportModal").style.display = "block";
}

function closeCSVExport() {
    document.getElementById("csvExportModal").style.display = "none";
}

// Sélectionner toutes les colonnes
document.getElementById("csv-all-columns")?.addEventListener("change", function () {
    const state = this.checked;
    document.querySelectorAll(".csv-column").forEach(cb => cb.checked = state);
});

// Sélectionner tous les types
document.getElementById("csv-all-types")?.addEventListener("change", function () {
    const state = this.checked;
    document.querySelectorAll(".csv-type").forEach(cb => cb.checked = state);
});

document.getElementById("csv-date-toggle").addEventListener("change", function () {
    const isDateMode = this.checked;

    // document.getElementById("csv-toggle-label").textContent =
    //     isDateMode ? "Filtrer par DATE" : "Filtrer par ANNÉES";

    document.getElementById("csv-filter-year-block").style.display =
        isDateMode ? "none" : "block";

    document.getElementById("csv-filter-date-block").style.display =
        isDateMode ? "block" : "none";
});

// ToggleLabels.js
const ToggleLabels = (() => {
    const toggle = document.getElementById("csv-date-toggle");
    const labelYear = document.getElementById("label-year");
    const labelDate = document.getElementById("label-date");

    const updateLabels = () => {
        if (toggle.checked) {
            setActive(labelDate);
            setInactive(labelYear);
        } else {
            setActive(labelYear);
            setInactive(labelDate);
        }
    };

    const setActive = (label) => label.classList.add("active");
    const setInactive = (label) => label.classList.remove("active");

    const init = () => {
        if (!toggle || !labelYear || !labelDate) return;
        updateLabels(); // état initial
        toggle.addEventListener("change", updateLabels); // écoute des changements
    };

    return { init };
})();


/**
 * ROADMAP
 */

function openRoadmap() {
    document.getElementById("roadmapView").style.display = "block";

    ["todo","doing","waiting","done"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    roadMapButton.style.background = "#e1f4ff";
    kanbanButton.style.background = "none";

    buildRoadmap();
}

let currentMonth = new Date(); // mois affiché par défaut

function changeMonth(offset) {
    currentMonth.setMonth(currentMonth.getMonth() + offset);
    buildRoadmap();
}

function formatMonth(date) {
    return date.toLocaleString("fr-FR", { month: "long", year: "numeric" });
}


let currentRoadmapMonth = new Date(); // Mois affiché par défaut
let currentRoadmapDay = new Date().getDate();

function changeMonth(offset) {
    currentRoadmapMonth.setMonth(currentRoadmapMonth.getMonth() + offset);
    buildRoadmap();
}

function buildRoadmap() {
    const grid = document.getElementById("roadmapGrid");
    const header = document.getElementById("roadmapHeader");
    grid.innerHTML = "";
    header.innerHTML = "";

    // On récupère les tâches d'essais seulement
    const essais = Object.values(taskData).filter(t => t.type === "essais");

    if (essais.length === 0) {
        grid.innerHTML = "<p>Aucun essai enregistré.</p>";
        return;
    }

    // Calcul du mois à afficher
    const monthStart = new Date(currentRoadmapMonth.getFullYear(), currentRoadmapMonth.getMonth(), 1);
    const monthEnd = new Date(currentRoadmapMonth.getFullYear(), currentRoadmapMonth.getMonth() + 1, 0); // dernier jour

    // Filtrer les essais qui touchent ce mois
    const essaisThisMonth = essais.filter(t => {
        const start = t.start ? new Date(t.start) : null;
        const end = t.end ? new Date(t.end) : null;
        if (!start || !end) return false;
        return end >= monthStart && start <= monthEnd;
    });

    if (essaisThisMonth.length === 0) {
        grid.innerHTML = "<p>Aucun essai pour ce mois.</p>";
        return;
    }

    // Header du calendrier
    const dayCount = monthEnd.getDate();
    header.style.display = "grid";
    header.style.gridTemplateColumns = `150px repeat(${dayCount}, 40px)`;

    // Cellule vide pour le nom produit
    const empty = document.createElement("div");
    header.appendChild(empty);

    // Nom du mois
    const monthName = monthStart.toLocaleString("fr-FR", { month: "long", year: "numeric" });
    const monthCell = document.createElement("div");
    monthCell.textContent = monthName.toUpperCase();
    monthCell.style.gridColumn = `span ${dayCount}`;
    monthCell.style.textAlign = "center";
    monthCell.style.fontWeight = "bold";
    monthCell.style.marginBottom = "5px";
    header.appendChild(monthCell);

    // Ligne des jours
    const daysRow = document.createElement("div");
    daysRow.style.gridColumn = `span ${dayCount + 1}`;
    daysRow.style.display = "grid";
    daysRow.style.gridTemplateColumns = ` repeat(${dayCount}, 40px)`;
    daysRow.style.justifyContent = "end";
    header.appendChild(daysRow);


    // Cellule vide pour les noms

    for (let i = 1; i <= dayCount; i++) {
        const day = document.createElement("div");
        day.textContent = i;
        day.style.textAlign = "center";
        day.style.fontSize = "12px";
        day.style.borderRadius = "5em"
        day.style.alignContent = "center"
        daysRow.appendChild(day);
        if (currentRoadmapMonth.getMonth() === currentMonth.getMonth() && currentRoadmapDay === i) {
            day.style.background = "#ff6b6b"
        } 
    }

    // Grouper les essais par produit
    const grouped = {};
    essaisThisMonth.forEach(t => {
        let productsArray = Array.isArray(t.products) ? t.products : [t.products || "unknown"];
        productsArray.forEach(p => {
            if (!grouped[p]) grouped[p] = [];
            grouped[p].push(t);
        });
    });

    // Construire les lignes produit
    Object.keys(grouped).forEach(productId => {
        const prod = products.find(p => p.id === productId) || { name: "Produit inconnu" };

        const row = document.createElement("div");
        row.className = "roadmap-row";
        row.style.display = "grid";
        row.style.gridTemplateColumns = `150px repeat(${dayCount}, 40px)`;
        grid.appendChild(row);

        // Nom produit
        const nameCell = document.createElement("div");
        nameCell.className = "roadmap-product-name";
        nameCell.textContent = prod.name;
        row.appendChild(nameCell);

        // Cases vides
        for (let i = 0; i < dayCount; i++) {
            const cell = document.createElement("div");
            row.appendChild(cell);
        }

        // Blocs d'essais
        grouped[productId].forEach(t => {
            const start = new Date(t.start);
            const end = new Date(t.end);

            // Calculer début et fin dans le mois affiché
            const startIndex = Math.max(0, Math.floor((start - monthStart) / (1000 * 60 * 60 * 24)));
            const endIndex = Math.min(dayCount - 1, Math.floor((end - monthStart) / (1000 * 60 * 60 * 24)));

            const duration = endIndex - startIndex + 1;

            const item = document.createElement("div");
            item.className = "roadmap-item";
            item.style.left = (150 + startIndex * 40) + "px";
            item.style.width = (duration * 40 - 4) + "px";
            item.textContent = t.text;
            item.onclick = () => showModal(t.id);

            // Conflit
            const conflict = grouped[productId].some(x =>
                x.id !== t.id &&
                new Date(x.start) <= end &&
                new Date(x.end) >= start
            );
            if (conflict) item.classList.add("conflict");

            row.appendChild(item);
        });
    });
}

function saveProducts() {
    localStorage.setItem("products", JSON.stringify(products));
}

function openProductsModal() {
    refreshProductsTable();
    document.getElementById("productsModal").style.display = "block";
}

function closeProductsModal() {
    document.getElementById("productsModal").style.display = "none";
}

function refreshProductsTable() {
    const tbody = document.querySelector("#productsTable tbody");
    tbody.innerHTML = "";

    products.forEach(prod => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>
                <input type="text" value="${prod.name}" 
                       onchange="updateProductName('${prod.id}', this.value)"
                       style="width:95%;">
            </td>
            <td>
                <button onclick="deleteProduct('${prod.id}')">🗑️</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function addProduct() {
    const name = document.getElementById("newProductName").value.trim();
    if (!name) return;

    const newProd = {
        id: "prod-" + crypto.randomUUID(),
        name
    };

    products.push(newProd);
    saveProducts();
    refreshProductsTable();
    populateProductList(); // met à jour dans les tâches
    document.getElementById("newProductName").value = "";
}

function updateProductName(id, newName) {
    const p = products.find(p => p.id === id);
    if (p) {
        p.name = newName;
        saveProducts();
        populateProductList(); 
    }
}

function deleteProduct(id) {
    if (!confirm("Supprimer ce produit ?")) return;

    products = products.filter(p => p.id !== id);
    saveProducts();
    refreshProductsTable();
    populateProductList();
}

function populateProductList() {
    const sel = document.getElementById("modal-product");
    sel.innerHTML = "";
    products.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function openKanban() {
    // cacher la roadmap
    document.getElementById("roadmapView").style.display = "none";

    // cacher modal produit si ouvert
    closeProductsModal();

    // montrer les colonnes kanban
    ["todo","doing","waiting","done"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "block";
    });

    
    roadMapButton.style.background = "none";
    kanbanButton.style.background = "#e1f4ff";
}
