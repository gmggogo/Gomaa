document.addEventListener("DOMContentLoaded", () => {

const nav = document.createElement("div");
nav.id = "driverBottomNav";

nav.innerHTML = `
<style>

#driverBottomNav{
position:fixed;
bottom:0;
left:0;
right:0;
height:65px;
background:#0f172a;
display:flex;
justify-content:space-around;
align-items:center;
z-index:9999;
box-shadow:0 -2px 10px rgba(0,0,0,0.4);
}

#driverBottomNav a{
color:white;
text-decoration:none;
font-size:13px;
display:flex;
flex-direction:column;
align-items:center;
justify-content:center;
gap:2px;
}

#driverBottomNav a span{
font-size:20px;
}

#driverBottomNav a.active{
color:#facc15;
}

</style>

<a href="/driver/dashboard.html">
<span>🏠</span>
<small>Home</small>
</a>

<a href="/driver/trips.html">
<span>🚗</span>
<small>Trips</small>
</a>

<a href="/driver/map.html">
<span>🗺️</span>
<small>Map</small>
</a>

<a href="#">
<span>💬</span>
<small>Chat</small>
</a>

<a href="/driver/login.html">
<span>🚪</span>
<small>Logout</small>
</a>

`;

document.body.appendChild(nav);

});