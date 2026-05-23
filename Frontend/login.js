const AUTH_STORAGE_KEY = 'hrms_auth_session';
const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');

const showMessage = (message, type = 'error') => {
  loginMessage.textContent = message;
  loginMessage.className = `auth-message ${type}`;
  loginMessage.style.display = 'block';
};

const clearMessage = () => {
  loginMessage.textContent = '';
  loginMessage.className = 'auth-message';
  loginMessage.style.display = 'none';
};

const setLoading = (isLoading) => {
  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading ? 'Logging in...' : 'Login';
};

async function attemptLogin(username, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function handleLogin(event) {
  event.preventDefault();
  clearMessage();
  setLoading(true);

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showMessage('Please enter email/username and password.', 'error');
    setLoading(false);
    return;
  }

  try {
    let { response, payload } = await attemptLogin(username, password);

    if (response.status === 401) {
      await fetch(`${API_BASE_URL}/api/setup/initialize-users`, {
        method: 'POST',
      }).catch(() => null);

      const retryResult = await attemptLogin(username, password);
      response = retryResult.response;
      payload = retryResult.payload;
    }

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Invalid username or password.');
    }

    // Store authentication session
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        username,
        role: payload?.role || '',
        loggedInAt: new Date().toISOString(),
        token: payload?.token || '',
        userId: payload?.userId || '',
      })
    );

    showMessage('Login successful! Redirecting...', 'success');

    // Redirect based on role
    setTimeout(() => {
      if (payload?.role === 'HR') {
        window.location.href = './hr-dashboard/index.html';
        return;
      }
      window.location.href = './employee-dashboard/index.html';
    }, 800);
  } catch (error) {
    showMessage(error.message || 'Login failed.', 'error');
  } finally {
    setLoading(false);
  }
}

loginForm.addEventListener('submit', handleLogin);
