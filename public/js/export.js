import { state } from './store.js';

export function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

export function printModalContent() {
    const data = state.taskData[state.currentTaskId];
    if (!data) return;

    const printWindow = window.open('', '_blank');
    const htmlContent = `
    <html>
    <head>
      <title>Impression Kanbinou</title>
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
      </script>
    </body>
    </html>
  `;
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

export async function exportTasksEncrypted(password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(password, salt);
    const data = JSON.stringify({
        taskData: state.taskData,
        columns: {
            todo: JSON.parse(localStorage.getItem("todo") || "[]"),
            doing: JSON.parse(localStorage.getItem("doing") || "[]"),
            waiting: JSON.parse(localStorage.getItem("waiting") || "[]"),
            done: JSON.parse(localStorage.getItem("done") || "[]")
        },
        products: state.products
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

export function promptExport() {
    const password = prompt("Mot de passe pour chiffrer les données :");
    if (!password) return;
    exportTasksEncrypted(password);
}

export function handleImportFile(event, reloadCallback) {
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
            localStorage.setItem("waiting", JSON.stringify(json.columns.waiting || []));
            localStorage.setItem("done", JSON.stringify(json.columns.done));
            state.taskData = json.taskData;

            localStorage.setItem("products", JSON.stringify(json.products || []));
            state.products = json.products || [];

            if(reloadCallback) reloadCallback();
            alert("Importation réussie !");
        } catch (err) {
            alert("Erreur : " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

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

export function downloadICS(taskId) {
    const task = state.taskData[taskId];
    if (!task) return;
  
    const start = new Date();
    const end = new Date(start.getTime() + (parseFloat(task.time) || 1) * 60 * 60 * 1000);
  
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

export function openCSVExport() {
    document.getElementById("csvExportModal").style.display = "block";
}

export function closeCSVExport() {
    document.getElementById("csvExportModal").style.display = "none";
}

export function confirmCSVExport() {
    const colCheckboxes = [...document.querySelectorAll(".csv-column:checked")];
    const selectedColumns = colCheckboxes.map(cb => cb.value);

    const typeCheckboxes = [...document.querySelectorAll(".csv-type:checked")];
    const selectedTypes = typeCheckboxes.map(cb => cb.value);

    const isDateMode = document.getElementById("csv-date-toggle").checked;

    let dateFrom = null, dateTo = null, selectedYears = [];

    if (isDateMode) {
        dateFrom = document.getElementById("csv-date-from").value || null;
        dateTo = document.getElementById("csv-date-to").value || null;
    } else {
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

        const tasksInColumn = [...(columnLists[colName]?.children || [])];

        tasksInColumn.forEach(el => {
            const t = state.taskData[el.id];
            if (!t) return;

            if (!exportAllTypes && !types.includes(t.type)) return;

            const taskDate = new Date(t.date);

            if (filterByDateRange) {
                if (dateFrom && taskDate < new Date(dateFrom)) return;
                if (dateTo && taskDate > new Date(dateTo + "T23:59:59")) return;
            }

            if (filterByYears && !years.includes(String(taskDate.getFullYear()))) {
                return;
            }

            if (soldFilter === "sold" && !t.sold) return;
            if (soldFilter === "not-sold" && t.sold) return;

            rows.push([
                t.id,
                t.text,
                t.description || "",
                t.projection || 0,
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
