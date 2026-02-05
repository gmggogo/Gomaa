document.addEventListener("DOMContentLoaded", () => {

  fetch("layout/sidebar.html")
    .then(response => response.text())
    .then(data => {
      document.getElementById("sidebar").innerHTML = data;
    })
    .catch(err => console.error("Sidebar error:", err));

  fetch("layout/header.html")
    .then(response => response.text())
    .then(data => {
      document.getElementById("header").innerHTML = data;
    })
    .catch(err => console.error("Header error:", err));

});