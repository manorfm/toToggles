// Estado global da aplicação
let currentAppId = null;
let currentAppName = null;
let currentEditingAppId = null;
let editingToggleId = null;
let lastEditedTogglePath = null;

// Elementos DOM
const applicationsSection = document.getElementById('applications-section');
const togglesSection = document.getElementById('toggles-section');
const applicationsList = document.getElementById('applications-list');
const togglesList = document.getElementById('toggles-list');
const appNameElement = document.getElementById('app-name');

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    loadApplications();
    
    // Botões principais
    document.getElementById('new-app-btn').addEventListener('click', () => openModal('app-modal'));
    document.getElementById('new-toggle-btn').addEventListener('click', () => openModal('toggle-modal'));
    document.getElementById('back-to-apps').addEventListener('click', showApplications);
    
    // Formulários
    document.getElementById('app-form').addEventListener('submit', handleCreateApplication);
    document.getElementById('toggle-form').addEventListener('submit', handleCreateToggle);
    document.getElementById('edit-toggle-form').addEventListener('submit', handleUpdateToggle);
});

// Funções de Modal
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    // Limpar formulários
    if (modalId === 'app-modal') {
        document.getElementById('app-form').reset();
        document.getElementById('app-modal-title').textContent = 'Nova Aplicação';
        currentEditingAppId = null;
    } else if (modalId === 'toggle-modal') {
        document.getElementById('toggle-form').reset();
        document.getElementById('toggle-modal-title').textContent = 'Novo Toggle';
    } else if (modalId === 'edit-toggle-modal') {
        document.getElementById('edit-toggle-form').reset();
        editingToggleId = null;
    }
}

// Funções de Navegação
function showApplications() {
    applicationsSection.classList.remove('hidden');
    togglesSection.classList.add('hidden');
    currentAppId = null;
    currentAppName = null;
}

function showToggles(appId, appName) {
    currentAppId = appId;
    currentAppName = appName;
    appNameElement.textContent = `Toggles de ${appName}`;
    
    applicationsSection.classList.add('hidden');
    togglesSection.classList.remove('hidden');
    
    loadToggles(appId);
}

// Funções de API
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showError(`Erro na requisição: ${error.message}`);
        throw error;
    }
}

// Funções de Aplicação
async function loadApplications() {
    try {
        showLoading(applicationsList);
        const applications = await apiCall('/applications');
        renderApplications(applications);
    } catch (error) {
        showEmptyState(applicationsList, 'Erro ao carregar aplicações');
    }
}

async function handleCreateApplication(event) {
    event.preventDefault();
    
    const name = document.getElementById('app-name-input').value.trim();
    if (!name) return;
    
    try {
        if (currentEditingAppId) {
            // Editando aplicação existente
            await apiCall(`/applications/${currentEditingAppId}`, {
                method: 'PUT',
                body: JSON.stringify({ name })
            });
            showSuccess('Aplicação atualizada com sucesso!');
            currentEditingAppId = null;
        } else {
            // Criando nova aplicação
            await apiCall('/applications', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            showSuccess('Aplicação criada com sucesso!');
        }
        
        closeModal('app-modal');
        loadApplications();
    } catch (error) {
        showError('Erro ao salvar aplicação');
    }
}

function renderApplications(applications) {
    if (!applications || applications.length === 0) {
        showEmptyState(applicationsList, 'Nenhuma aplicação encontrada', 'Crie sua primeira aplicação para começar!');
        return;
    }
    
    applicationsList.innerHTML = applications.map(app => `
        <div class="card">
            <div class="card-header">
                <div class="card-title-col">
                    <h3 class="app-title">${app.name}</h3>
                    <div class="app-counters-row">
                        <span title="Toggles habilitados" class="counter enabled"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2l4-4"/></svg> ${app.toggles_enabled}</span>
                        <span title="Toggles desabilitados" class="counter disabled"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg> ${app.toggles_disabled}</span>
                        <span title="Total de toggles" class="counter total"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg> ${app.toggles_total}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="icon-btn" title="Ver Toggles" onclick="event.stopPropagation(); showToggles('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="icon-btn" title="Editar Aplicação" onclick="event.stopPropagation(); editApplication('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="icon-btn danger" title="Remover Aplicação" onclick="event.stopPropagation(); deleteApplication('${app.id}', '${app.name}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Funções de Toggle
async function loadToggles(appId) {
    try {
        showLoading(togglesList);
        const response = await apiCall(`/applications/${appId}/toggles?hierarchy=true`);
        renderToggles(response.toggles);
    } catch (error) {
        showEmptyState(togglesList, 'Erro ao carregar toggles');
    }
}

async function handleCreateToggle(event) {
    event.preventDefault();
    
    const path = document.getElementById('toggle-path-input').value.trim();
    const enabled = document.getElementById('toggle-enabled-input').checked;
    
    if (!path) return;
    
    try {
        await apiCall(`/applications/${currentAppId}/toggles`, {
            method: 'POST',
            body: JSON.stringify({ toggle: path })
        });
        
        closeModal('toggle-modal');
        showSuccess('Toggle criado com sucesso!');
        loadToggles(currentAppId);
    } catch (error) {
        showError('Erro ao criar toggle');
    }
}

async function handleUpdateToggle(event) {
    event.preventDefault();
    const enabled = document.getElementById('edit-toggle-enabled-input').checked;
    if (!editingToggleId) return;
    try {
        await apiCall(`/applications/${currentAppId}/toggles/${editingToggleId}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled })
        });
        showSuccess('Toggle atualizado com sucesso!');
        closeModal('edit-toggle-modal');
        loadToggles(currentAppId);
        editingToggleId = null;
    } catch (error) {
        showError('Erro ao salvar toggle');
    }
}

function renderToggles(toggles) {
    if (!toggles || toggles.length === 0) {
        showEmptyState(togglesList, 'Nenhum toggle encontrado', 'Crie seu primeiro toggle para começar!');
        return;
    }
    // Extrair todos os caminhos folha
    const leafNodes = [];
    function traverse(node, path = [], enabledPath = [], idPath = []) {
        const newPath = [...path, node.value];
        const newEnabledPath = [...enabledPath, node.enabled];
        const newIdPath = [...idPath, node.id];
        if (!node.toggles || node.toggles.length === 0) {
            leafNodes.push({
                id: node.id,
                path: newPath,
                enabledPath: newEnabledPath,
                idPath: newIdPath
            });
        } else {
            node.toggles.forEach(child => traverse(child, newPath, newEnabledPath, newIdPath));
        }
    }
    toggles.forEach(root => traverse(root));

    togglesList.innerHTML = leafNodes.map(toggle => {
        // Status: verde (todos true), vermelho (todos false), amarelo (misto)
        const allEnabled = toggle.enabledPath.every(e => e);
        const allDisabled = toggle.enabledPath.every(e => !e);
        let status = 'yellow';
        if (allEnabled) status = 'green';
        else if (allDisabled) status = 'red';

        // SVG marcador
        let statusSVG = '';
        if (status === 'green') {
            statusSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2l4-4"/></svg>`;
        } else if (status === 'yellow') {
            statusSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
        } else {
            statusSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
        }

        // Caminho concatenado
        const pathStr = toggle.path.join('.');
        // Links: aplicar disabled a partir do primeiro false
        let disabledFound = false;
        const pathLinks = toggle.path.map((part, idx) => {
            if (!disabledFound && !toggle.enabledPath[idx]) disabledFound = true;
            const linkClass = disabledFound ? 'path-link disabled' : 'path-link';
            const toggleId = toggle.idPath[idx];
            return `<a href="#" class="${linkClass}" onclick="editTogglePath('${toggleId}'); return false;">${part}</a>`;
        }).join('<span class="path-separator">.</span>');

        return `
            <div class="toggle-card toggle-line">
                <span class="toggle-status-dot">${statusSVG}</span>
                <span class="toggle-path-line">${pathLinks}</span>
                <button class="icon-btn danger" title="Excluir Toggle" onclick="deleteToggle('${pathStr}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

// Função auxiliar para buscar o nó de um path parcial
function getNodeByPath(rootNode, pathParts) {
    let node = rootNode;
    for (let i = 1; i < pathParts.length; i++) {
        if (!node.toggles) return null;
        node = node.toggles.find(child => child.value === pathParts[i]);
        if (!node) return null;
    }
    return node;
}

// Funções de Edição
function editToggle(path, enabled) {
    lastEditedTogglePath = path;
    document.getElementById('edit-toggle-path-input').value = path;
    document.getElementById('edit-toggle-enabled-input').checked = enabled;
    document.getElementById('edit-toggle-title').textContent = 'Editar Toggle';
    openModal('edit-toggle-modal');
}

async function editTogglePath(toggleId) {
    try {
        const toggle = await apiCall(`/applications/${currentAppId}/toggles/${toggleId}`);
        editingToggleId = toggle.id;
        document.getElementById('edit-toggle-path-input').value = toggle.path;
        document.getElementById('edit-toggle-enabled-input').checked = toggle.enabled;
        document.getElementById('edit-toggle-title').textContent = 'Editar Toggle';
        openModal('edit-toggle-modal');
    } catch (e) {
        showError('Erro ao buscar toggle para edição');
    }
}

// Função para encontrar toggle por path na estrutura hierárquica
function findToggleByPath(toggles, path) {
    const parts = path.split('.');
    let nodes = toggles;
    let node = null;
    for (let i = 0; i < parts.length; i++) {
        node = Array.isArray(nodes)
            ? nodes.find(n => n.value === parts[i])
            : null;
        if (!node) return null;
        nodes = node.toggles || [];
    }
    return node;
}

async function deleteToggle(path) {
    if (!confirm(`Tem certeza que deseja excluir o toggle "${path}"?`)) {
        return;
    }
    
    try {
        // Buscar o toggle na estrutura hierárquica para obter o ID
        const response = await apiCall(`/applications/${currentAppId}/toggles?hierarchy=true`);
        const found = findToggleByPath(response.toggles, path);
        
        if (!found) {
            showError('Toggle não encontrado');
            return;
        }
        
        await apiCall(`/applications/${currentAppId}/toggles?path=${encodeURIComponent(path)}`, {
            method: 'DELETE'
        });
        
        showSuccess('Toggle excluído com sucesso!');
        loadToggles(currentAppId);
    } catch (error) {
        showError('Erro ao excluir toggle');
    }
}

async function deleteApplication(appId, appName) {
    const message = `Tem certeza que deseja remover a aplicação "${appName}"?\n\n⚠️ ATENÇÃO: Esta ação irá remover TODOS os toggles associados a esta aplicação e não pode ser desfeita!`;
    
    if (!confirm(message)) {
        return;
    }
    
    try {
        await apiCall(`/applications/${appId}`, {
            method: 'DELETE'
        });
        
        showSuccess(`Aplicação "${appName}" removida com sucesso!`);
        
        // Se estava visualizando os toggles desta aplicação, volta para a lista de aplicações
        if (currentAppId === appId) {
            showApplications();
        } else {
            // Recarrega a lista de aplicações
            loadApplications();
        }
    } catch (error) {
        showError('Erro ao remover aplicação');
    }
}

function editApplication(appId, appName) {
    currentEditingAppId = appId;
    document.getElementById('app-name-input').value = appName;
    document.getElementById('app-modal-title').textContent = 'Editar Aplicação';
    openModal('app-modal');
}

// Funções de UI
function showLoading(container) {
    container.innerHTML = '<div class="loading">Carregando...</div>';
}

function showEmptyState(container, title, message = '') {
    container.innerHTML = `
        <div class="empty-state">
            <h3>${title}</h3>
            ${message ? `<p>${message}</p>` : ''}
        </div>
    `;
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    document.querySelector('main').insertBefore(errorDiv, document.querySelector('main').firstChild);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    
    document.querySelector('main').insertBefore(successDiv, document.querySelector('main').firstChild);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Fechar modais ao clicar fora
window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
}); 