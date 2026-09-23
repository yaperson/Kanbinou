import { state, saveAll } from './store.js';
import { updateStatistics } from './ui.js';
import { populateProductList } from './roadmap.js';
import { downloadICS } from './export.js';

export function showModal(taskId) {
    state.currentTaskId = taskId;
    const data = state.taskData[taskId];
    if (!data) return;

    document.getElementById("taskModal").style.display = "block";

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

export function saveModalData() {
    const data = state.taskData[state.currentTaskId];
    if (!data) return;

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

    const task = document.getElementById(state.currentTaskId);
    const spans = task.querySelectorAll("span");
    if(spans.length >= 2) {
        spans[0].textContent = data.text;
        spans[1].className = "type-badge type-" + data.type;
        spans[1].textContent = data.type.charAt(0).toUpperCase() + data.type.slice(1);
    }
}

export function closeModal() {
    document.getElementById("taskModal").style.display = "none";
}

export function deleteTaskFromModal() {
    if (state.currentTaskId && state.taskData[state.currentTaskId]) {
        if (confirm("Supprimer cette tâche ?")) {
            const task = document.getElementById(state.currentTaskId);
            if (task) task.remove();
            delete state.taskData[state.currentTaskId];
            saveAll();
            updateStatistics();
            closeModal();
        }
    }
}
