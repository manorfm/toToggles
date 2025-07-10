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
const globalLoadingSpinner = document.getElementById('global-loading-spinner');

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    loadApplications();
    
    // Botões principais
    document.getElementById('new-app-btn').addEventListener('click', () => {
        currentEditingAppId = null;
        document.getElementById('app-modal-title').textContent = 'New Application';
        document.getElementById('app-form').reset();
        openModal('app-modal');
    });
    document.getElementById('new-toggle-btn').addEventListener('click', () => openModal('toggle-modal'));
    document.getElementById('back-to-apps').addEventListener('click', showApplications);
    
    // Formulários
    document.getElementById('app-form').addEventListener('submit', handleCreateApplication);
    document.getElementById('toggle-form').addEventListener('submit', handleCreateToggle);
    document.getElementById('edit-toggle-form').addEventListener('submit', handleUpdateToggle);

    // Após carregar aplicações, verificar se deve abrir tela de toggles
    const savedAppId = localStorage.getItem('currentAppId');
    const savedAppName = localStorage.getItem('currentAppName');
    if (savedAppId && savedAppName) {
        showToggles(savedAppId, savedAppName);
    }
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
        document.getElementById('app-modal-title').textContent = 'New Application';
        currentEditingAppId = null;
    } else if (modalId === 'toggle-modal') {
        document.getElementById('toggle-form').reset();
        document.getElementById('toggle-modal-title').textContent = 'New Toggle';
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
    // Clear localStorage
    localStorage.removeItem('currentAppId');
    localStorage.removeItem('currentAppName');
    loadApplications();
}

function showToggles(appId, appName) {
    currentAppId = appId;
    currentAppName = appName;
    appNameElement.textContent = `Toggles of ${appName}`;
    applicationsSection.classList.add('hidden');
    togglesSection.classList.remove('hidden');
    // Persistir no localStorage
    localStorage.setItem('currentAppId', appId);
    localStorage.setItem('currentAppName', appName);
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
            // Tentar extrair a mensagem de erro da resposta JSON
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                
                // Verificar se é a estrutura de erro padronizada
                if (errorData.code && errorData.message) {
                    // Se há detalhes de erro, usar apenas os detalhes
                    if (errorData.details && errorData.details.length > 0) {
                        const detailMessages = errorData.details.map(detail => 
                            `${detail.field}: ${detail.message}`
                        );
                        errorMessage = detailMessages.join('\n');
                    } else {
                        // Se não há detalhes, usar apenas a mensagem principal
                        errorMessage = errorData.message;
                    }
                } else if (errorData.message) {
                    // Fallback para outras estruturas de erro
                    errorMessage = errorData.message;
                }
            } catch (parseError) {
                // Se não conseguir fazer parse do JSON, usar a mensagem padrão
                console.warn('Could not parse error response:', parseError);
            }
            throw new Error(errorMessage);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showError(`Error in request: ${error.message}`);
        throw error;
    }
}

// Funções de Aplicação
async function loadApplications() {
    showGlobalLoading();
    try {
        // showLoading(applicationsList); // Remover esta linha, pois o spinner global será usado
        const applications = await apiCall('/applications');
        renderApplications(applications);
    } catch (error) {
        showEmptyState(applicationsList, 'No applications found', 'Create your first application to get started!');
    } finally {
        hideGlobalLoading();
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
            showSuccess('Application updated successfully!');
            currentEditingAppId = null;
        } else {
            // Criando nova aplicação
            await apiCall('/applications', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            showSuccess('Application created successfully!');
        }
        
        closeModal('app-modal');
        loadApplications();
    } catch (error) {
        showError('Error saving application');
    }
}

function renderApplications(applications) {
    if (!applications || applications.length === 0) {
        showEmptyState(applicationsList, 'No applications found', 'Create your first application to get started!');
        return;
    }
    applicationsList.innerHTML = applications.map(app => `
        <div class="card app-card" data-app-id="${app.id}">
            <div class="app-card-header">
                <div class="app-card-header-right">
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
            <div class="toggle-divider"></div>
            <div class="app-card-body">
                <div class="app-title-row">
                    <a href="#" class="app-title-link" onclick="event.preventDefault(); showToggles('${app.id}', '${app.name}')">${app.name}</a>
                </div>
                <div class="app-counters-row">
                    <span title="Toggles enabled" class="counter enabled"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2l4-4"/></svg> ${app.toggles_enabled}</span>
                    <span title="Toggles disabled" class="counter disabled"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="8"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg> ${app.toggles_disabled}</span>
                    <span title="Total of toggles" class="counter total"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg> ${app.toggles_total}</span>
                </div>
                <div class="app-toggles-list" id="app-toggles-list-${app.id}" style="display:none;"></div>
            </div>
        </div>
    `).join('');
}

// Funções de Toggle
async function loadToggles(appId) {
    showGlobalLoading();
    try {
        // showLoading(togglesList); // Remover esta linha, pois o spinner global será usado
        const response = await apiCall(`/applications/${appId}/toggles?hierarchy=true`);
        renderToggles(response.toggles);
    } catch (error) {
        showEmptyState(togglesList, 'No toggles found', 'Create your first toggle to get started!');
    } finally {
        hideGlobalLoading();
    }
}

async function handleCreateToggle(event) {
    event.preventDefault();
    
    const path = document.getElementById('toggle-path-input').value.trim();
    
    if (!path) return;
    
    try {
        await apiCall(`/applications/${currentAppId}/toggles`, {
            method: 'POST',
            body: JSON.stringify({ toggle: path })
        });
        
        closeModal('toggle-modal');
        showSuccess('Toggle created successfully!');
        loadToggles(currentAppId);
    } catch (error) {
        showError('Error creating toggle');
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
        showSuccess('Toggle updated successfully!');
        closeModal('edit-toggle-modal');
        loadToggles(currentAppId);
        editingToggleId = null;
    } catch (error) {
        showError('Error saving toggle');
    }
}

function renderToggles(toggles) {
    if (!toggles || toggles.length === 0) {
        showEmptyState(togglesList, 'No toggles found', 'Create your first toggle to get started!');
        return;
    }
    
    // Extrair todos os caminhos folha
    const leafNodes = [];
    function traverse(node, path = [], enabledPath = [], idPath = []) {
        // Verificar se o node tem a propriedade value
        if (!node.value) {
            // Se não tem value, usar o ID como fallback
            node.value = node.id;
        }
        
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

    if (leafNodes.length === 0) {
        showEmptyState(togglesList, 'No toggles found', 'Create your first toggle to get started!');
        return;
    }

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
            <div class="toggle-card">
                <div class="toggle-card-header">
                    <div class="toggle-header-left"><span class="toggle-status-dot">${statusSVG}</span></div>
                    <div class="toggle-header-right">
                        <button class="icon-btn danger" title="Excluir Toggle" onclick="deleteToggle('${toggle.id}', '${pathStr}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"/>
                                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                                <line x1="10" y1="11" x2="10" y2="17"/>
                                <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="toggle-divider"></div>
                <div class="toggle-card-body">
                    <span class="toggle-path-line">${pathLinks}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Funções de Edição
function editToggle(path, enabled) {
    lastEditedTogglePath = path;
    document.getElementById('edit-toggle-path-input').value = path;
    document.getElementById('edit-toggle-enabled-input').checked = enabled;
    document.getElementById('edit-toggle-title').textContent = 'Edit Toggle';
    openModal('edit-toggle-modal');
}

async function editTogglePath(toggleId) {
    try {
        const toggle = await apiCall(`/applications/${currentAppId}/toggles/${toggleId}`);
        editingToggleId = toggle.id;
        document.getElementById('edit-toggle-path-input').value = toggle.path;
        document.getElementById('edit-toggle-enabled-input').checked = toggle.enabled;
        document.getElementById('edit-toggle-title').textContent = 'Edit Toggle';
        openModal('edit-toggle-modal');
    } catch (e) {
        showError('Error finding toggle for editing');
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

async function deleteToggle(toggleId, togglePath) {
    // Criar modal de confirmação profissional
    const confirmModal = createConfirmModal(
        'Delete Toggle',
        `Are you sure you want to delete the toggle "${togglePath}"?`,
        'This action will permanently delete this toggle and all its child toggles. This action cannot be undone.',
        'Delete',
        'Cancel'
    );
    
    document.body.appendChild(confirmModal);
    
    // Aguardar resposta do usuário
    const confirmed = await new Promise((resolve) => {
        const confirmBtn = confirmModal.querySelector('.confirm-btn');
        const cancelBtn = confirmModal.querySelector('.cancel-btn');
        
        confirmBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(true);
        };
        
        cancelBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(false);
        };
        
        // Fechar ao clicar fora do modal
        confirmModal.onclick = (e) => {
            if (e.target === confirmModal) {
                document.body.removeChild(confirmModal);
                resolve(false);
            }
        };
    });
    
    if (!confirmed) {
        return;
    }
    
    try {
        await apiCall(`/applications/${currentAppId}/toggles/${toggleId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Toggle deleted successfully!');
        loadToggles(currentAppId);
    } catch (error) {
        showError('Error deleting toggle');
    }
}

// Função para criar modal de confirmação profissional
function createConfirmModal(title, message, description, confirmText, cancelText, iconType = 'danger') {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    
    let iconSVG = '';
    let iconClass = '';
    
    if (iconType === 'danger') {
        iconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
        iconClass = 'danger';
    } else if (iconType === 'warning') {
        iconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`;
        iconClass = 'warning';
    }
    
    modal.innerHTML = `
        <div class="confirm-modal-content">
            <div class="confirm-modal-header">
                <div class="confirm-modal-icon ${iconClass}">
                    ${iconSVG}
                </div>
                <h3>${title}</h3>
            </div>
            <div class="confirm-modal-body">
                <p class="confirm-message">${message}</p>
                <p class="confirm-description">${description}</p>
            </div>
            <div class="confirm-modal-actions">
                <button class="btn btn-secondary cancel-btn">${cancelText}</button>
                <button class="btn btn-danger confirm-btn">${confirmText}</button>
            </div>
        </div>
    `;
    return modal;
}

async function deleteApplication(appId, appName) {
    // Criar modal de confirmação profissional
    const confirmModal = createConfirmModal(
        'Delete Application',
        `Are you sure you want to delete the application "${appName}"?`,
        '⚠️ WARNING: This action will permanently delete this application and ALL its toggles. This action cannot be undone.',
        'Delete',
        'Cancel',
        'warning'
    );
    
    document.body.appendChild(confirmModal);
    
    // Aguardar resposta do usuário
    const confirmed = await new Promise((resolve) => {
        const confirmBtn = confirmModal.querySelector('.confirm-btn');
        const cancelBtn = confirmModal.querySelector('.cancel-btn');
        
        confirmBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(true);
        };
        
        cancelBtn.onclick = () => {
            document.body.removeChild(confirmModal);
            resolve(false);
        };
        
        // Fechar ao clicar fora do modal
        confirmModal.onclick = (e) => {
            if (e.target === confirmModal) {
                document.body.removeChild(confirmModal);
                resolve(false);
            }
        };
    });
    
    if (!confirmed) {
        return;
    }
    
    try {
        await apiCall(`/applications/${appId}`, {
            method: 'DELETE'
        });
        
        showSuccess(`Application "${appName}" deleted successfully!`);
        
        // Se estava visualizando os toggles desta aplicação, volta para a lista de aplicações
        if (currentAppId === appId) {
            showApplications();
        } else {
            // Recarrega a lista de aplicações
            loadApplications();
        }
    } catch (error) {
        showError('Error deleting application');
    }
}

function editApplication(appId, appName) {
    currentEditingAppId = appId;
    document.getElementById('app-name-input').value = appName;
    document.getElementById('app-modal-title').textContent = 'Edit Application';
    openModal('app-modal');
}

// Funções de UI
function showGlobalLoading() {
    if (globalLoadingSpinner) {
        globalLoadingSpinner.classList.remove('hidden');
    }
}

function hideGlobalLoading() {
    if (globalLoadingSpinner) {
        globalLoadingSpinner.classList.add('hidden');
    }
}

// A função showLoading original pode ser mantida se for usada em outros lugares,
// ou removida/adaptada se o spinner global for o único indicador de carregamento.
// Por enquanto, vamos mantê-la, mas ela não será mais chamada por loadApplications/loadToggles.
function showLoading(container) {
    container.innerHTML = '<div class="loading">Loading...</div>';
}

function showEmptyState(container, title, message = '') {
    container.innerHTML = `
        <div class="empty-state">
            <h3>${title}</h3>
            ${message ? `<p>${message}</p>` : ''}
        </div>
    `;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Se a mensagem contém quebras de linha, formatar como HTML
    if (message.includes('\n')) {
        const formattedMessage = message
            .split('\n')
            .filter(line => line.trim()) // Remove linhas vazias
            .map(line => `<div>${line}</div>`)
            .join('');
        toast.innerHTML = formattedMessage;
    } else {
        toast.innerHTML = message;
    }
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 6000); // Aumentar tempo para mensagens de erro mais longas
}

function showSuccess(msg) { showToast(msg, 'success'); }
function showError(msg) { showToast(msg, 'error'); }
function showInfo(msg) { showToast(msg, 'info'); }
function showWarning(msg) { showToast(msg, 'warning'); }

// Fechar modais ao clicar fora
window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

// Fechar modais com tecla ESC
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (!modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
        
        // Fechar modais de confirmação também
        const confirmModals = document.querySelectorAll('.confirm-modal');
        confirmModals.forEach(modal => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        });
    }
}); 