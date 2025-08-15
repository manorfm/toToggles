// Login page functionality
document.addEventListener('DOMContentLoaded', function() {
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
            showLoading(true);
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
                    
                    // Aguardar um pouco antes de redirecionar
                    setTimeout(() => {
                        window.location.href = '/change-password';
                    }, 1500);
                } else {
                    // Login normal com token gerado
                    // Store user data in sessionStorage (token is in HTTP-only cookie)
                    sessionStorage.setItem('current_user', JSON.stringify(data.user));
                    
                    // Mostrar feedback de sucesso
                    showLoginSuccess();
                    
                    // Aguardar um pouco antes de redirecionar para melhor UX
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                }
            } else {
                showError(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Connection error. Please try again.');
        } finally {
            showLoading(false);
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
    
    function showLoginSuccess() {
        // Ocultar loading
        showLoading(false);
        
        // Mostrar feedback visual de sucesso
        const loginContainer = document.querySelector('.login-container');
        if (loginContainer) {
            loginContainer.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            loginContainer.style.transition = 'background 0.8s ease';
        }
        
        // Adicionar ícone de sucesso
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
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
        // Ocultar loading
        showLoading(false);
        
        // Mostrar feedback visual para mudança de senha
        const loginContainer = document.querySelector('.login-container');
        if (loginContainer) {
            loginContainer.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            loginContainer.style.transition = 'background 0.8s ease';
        }
        
        // Adicionar ícone de aviso
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
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