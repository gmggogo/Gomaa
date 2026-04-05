document.getElementById("driverNav").innerHTML = `

<div class="nav">

<button onclick="goHome()">
<span>🏠</span>
Home
</button>

<button onclick="goTrips()">
<span>🚗</span>
Trips
</button>

<button onclick="goMap()">
<span>🗺️</span>
Map
</button>

<button onclick="goChat()">
<span>💬</span>
Chat
</button>

<button onclick="logout()">
<span>🚪</span>
Logout
</button>

</div>

`;

/* NAV FUNCTIONS */

function goHome(){
window.location.href="dashboard.html";
}

function goTrips(){
window.location.href="trips.html";
}

function goMap(){
window.location.href="map.html";
}

function goChat(){
window.location.href="chat.html";
}

function logout(){
localStorage.removeItem("loggedDriver");
window.location.href="login.html";
}