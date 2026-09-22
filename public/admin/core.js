// Load header
fetch("header.html")
.then(res => res.text())
.then(data => {
    document.getElementById("header").innerHTML = data;

    // Load sidebar after header
    fetch("sidebar.html")
    .then(res => res.text())
    .then(sidebar => {
        document.getElementById("sidebar").innerHTML = sidebar;
    });
});

// Date & Time
function updateDateTime() {
    const now = new Date();
    document.getElementById("dateTime").innerText =
        now.toLocaleDateString() + " | " + now.toLocaleTimeString();
}
setInterval(updateDateTime, 1000);
updateDateTime();