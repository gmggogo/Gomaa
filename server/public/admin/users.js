const nameInput = document.getElementById("inputName");
const usernameInput = document.getElementById("inputUsername");
const passwordInput = document.getElementById("inputPassword");
const list = document.getElementById("list");

async function load() {
  const res = await fetch("/api/admins");
  const data = await res.json();
  list.innerHTML = "";
  data.forEach(a => {
    list.innerHTML += `
      <tr>
        <td>${a.name}</td>
        <td>${a.username}</td>
        <td>${a.status}</td>
      </tr>`;
  });
}

async function addUser() {
  const name = nameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!name || !username || !password) {
    alert("Fill all fields");
    return;
  }

  const res = await fetch("/api/admins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error);
    return;
  }

  nameInput.value = "";
  usernameInput.value = "";
  passwordInput.value = "";
  load();
}

load();