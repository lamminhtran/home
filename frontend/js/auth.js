/* ===== REGISTER ===== */
async function register() {
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  const confirm  = document.getElementById("reg-confirm").value.trim();

  if (!username || !password || !confirm) {
    alert("Vui lòng nhập đầy đủ thông tin");
    return;
  }

  if (password !== confirm) {
    alert("Mật khẩu nhập lại không khớp");
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.msg || "Đăng ký thất bại");
      return;
    }

    // Auto login or just redirect?
    // Let's create token and login immediately as per backend logic returning token
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", username);
    
    alert("Đăng ký thành công");
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    alert("Lỗi kết nối server");
  }
}

/* ===== LOGIN ===== */
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!username || !password) {
    alert("Vui lòng nhập đầy đủ thông tin");
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.msg || "Sai tài khoản hoặc mật khẩu");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("username", username);

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    alert("Lỗi kết nối server");
  }
}

/* ===== LOGOUT ===== */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "login.html";
}
