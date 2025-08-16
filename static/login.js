// Login page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Remover qualquer overlay de transição que possa ter persistido
    const existingOverlay = document.getElementById('page-transition-overlay');
    if (existingOverlay) {
        existingOverlay.classList.add('hidden');
        setTimeout(() => {
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
        }, 500);
    }
    
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const loadingSpinner = document.getElementById('login-loading');
    const defaultCredentials = document.getElementById('default-credentials');

    // Verificar se é o primeiro acesso para mostrar credenciais padrão
    checkFirstAccess();

    // Não precisa verificar tokens - o servidor redireciona automaticamente se já autenticado

    // Foco automático no campo username
    usernameInput.focus();

    async function checkFirstAccess() {
        try {
            const response = await fetch('/auth/check-first-access');
            const data = await response.json();
            
            if (data.first_access) {
                defaultCredentials.style.display = 'block';
            }
        } catch (error) {
            console.error('Failed to check first access:', error);
        }
    }

    // Submit do formulário
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showError('Please fill in all fields');
            return;
        }

        await performLogin(username, password);
    });

    // Enter para navegar entre campos
    usernameInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            passwordInput.focus();
        }
    });

    async function performLogin(username, password) {
        try {
            // Feedback instantâneo: mudar botão imediatamente para "Authenticating..."
            showAuthenticatingState();
            hideError();

            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include', // Include cookies
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (data.success) {
                // Verificar se o usuário precisa mudar a senha (sem token)
                if (data.must_change_password) {
                    // Store temporary user data for password change process
                    const tempUserData = {
                        user_id: data.user_id,
                        username: data.username
                    };
                    sessionStorage.setItem('password_change_user', JSON.stringify(tempUserData));
                    
                    // Mostrar feedback específico
                    showPasswordChangeRequired();
                    
                    // Transição imediata com overlay
                    setTimeout(() => {
                        // Criar overlay de transição
                        createPageTransition('Password Change Required', 'Redirecting to password change...');
                        
                        // Redirecionamento mais rápido
                        setTimeout(() => {
                            window.location.href = '/change-password';
                        }, 600);
                    }, 800);
                } else {
                    // Login normal com token gerado
                    // Store user data in sessionStorage (token is in HTTP-only cookie)
                    sessionStorage.setItem('current_user', JSON.stringify(data.user));
                    
                    // Mostrar feedback de sucesso
                    showLoginSuccess();
                    
                    // Transição imediata com overlay
                    setTimeout(() => {
                        // Criar overlay de transição
                        createPageTransition('Redirecting to Dashboard', 'Loading your applications...');
                        
                        // Redirecionamento mais rápido
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 600);
                    }, 700);
                }
            } else {
                showError(data.error || 'Login failed');
                // Restaurar botão em caso de erro de login
                restoreLoginButton();
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Connection error. Please try again.');
            // Restaurar botão para estado original em caso de erro
            restoreLoginButton();
        }
    }

    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        
        // Shake animation
        errorMessage.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            errorMessage.style.animation = '';
        }, 500);
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    function showLoading(show) {
        if (show) {
            loadingSpinner.classList.remove('hidden');
        } else {
            loadingSpinner.classList.add('hidden');
        }
    }
    
    function showAuthenticatingState() {
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            // Mudar imediatamente para estado de autenticação
            submitBtn.innerHTML = `
                <div class="btn-spinner"></div>
                <span>Authenticating...</span>
            `;
            submitBtn.style.background = '#3b82f6';
            submitBtn.style.borderColor = '#3b82f6';
            submitBtn.disabled = true;
            
            // Adicionar animação de spinner se não existir
            if (!document.querySelector('#btn-spinner-animation')) {
                const style = document.createElement('style');
                style.id = 'btn-spinner-animation';
                style.textContent = `
                    .btn-spinner {
                        width: 16px;
                        height: 16px;
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        border-top: 2px solid white;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-right: 8px;
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }
    
    function restoreLoginButton() {
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            // Restaurar botão para estado original
            submitBtn.innerHTML = `
                <span>Sign In</span>
            `;
            submitBtn.style.background = '';
            submitBtn.style.borderColor = '';
            submitBtn.disabled = false;
        }
    }
    
    function showLoginSuccess() {
        // Mostrar feedback visual de sucesso imediatamente
        const loginContainer = document.querySelector('.login-container');
        if (loginContainer) {
            loginContainer.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            loginContainer.style.transition = 'background 0.4s ease';
        }
        
        // Adicionar ícone de sucesso com transição suave
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.style.transition = 'all 0.3s ease';
            submitBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span>Login Successful!</span>
            `;
            submitBtn.style.background = '#10b981';
            submitBtn.style.borderColor = '#10b981';
            submitBtn.disabled = true;
        }
    }
    
    function showPasswordChangeRequired() {
        // Mostrar feedback visual para mudança de senha imediatamente
        const loginContainer = document.querySelector('.login-container');
        if (loginContainer) {
            loginContainer.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            loginContainer.style.transition = 'background 0.4s ease';
        }
        
        // Adicionar ícone de aviso com transição suave
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.style.transition = 'all 0.3s ease';
            submitBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                </svg>
                <span>Password Change Required</span>
            `;
            submitBtn.style.background = '#f59e0b';
            submitBtn.style.borderColor = '#f59e0b';
            submitBtn.disabled = true;
        }
    }
});

// Shake animation for error messages
const shakeKeyframes = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    75% { transform: translateX(8px); }
}
`;

// Adicionar os keyframes ao CSS se não existirem
if (!document.querySelector('#shake-animation')) {
    const style = document.createElement('style');
    style.id = 'shake-animation';
    style.textContent = shakeKeyframes;
    document.head.appendChild(style);
}

// Função para criar overlay de transição suave
function createPageTransition(text, subtext) {
    // Verificar se já existe um overlay
    let overlay = document.getElementById('page-transition-overlay');
    
    if (!overlay) {
        // Criar overlay se não existir
        overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';
        overlay.className = 'page-transition-overlay';
        
        overlay.innerHTML = `
            <div class="page-transition-content">
                <div class="page-transition-spinner"></div>
                <div class="page-transition-text">${text}</div>
                <div class="page-transition-subtext">${subtext}</div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    } else {
        // Atualizar conteúdo se já existir
        const textElement = overlay.querySelector('.page-transition-text');
        const subtextElement = overlay.querySelector('.page-transition-subtext');
        
        if (textElement) textElement.textContent = text;
        if (subtextElement) subtextElement.textContent = subtext;
        
        // Mostrar overlay se estiver oculto
        overlay.classList.remove('hidden');
    }
    
    // Forçar o reflow para garantir que a transição funcione
    overlay.offsetHeight;
}