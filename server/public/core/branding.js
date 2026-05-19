<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<title>
Sunbeam Transportation
</title>

<meta
name="viewport"
content="width=device-width, initial-scale=1.0">

<link rel="icon"
href="assets/app-icon.png">

<link rel="apple-touch-icon"
href="assets/app-icon.png">

<style>

/* =========================
GLOBAL
========================= */

*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

body{

    font-family:
    'Segoe UI',
    Arial,
    sans-serif;

    background:#f3f4f6;

    overflow-x:hidden;

    color:#0f172a;

}

/* =========================
TOP BAR
========================= */

.top-bar{

    width:100%;

    display:flex;

    justify-content:space-between;

    align-items:center;

    gap:20px;

    padding:18px 24px;

    background:#f8fafc;

    flex-wrap:wrap;

    position:sticky;

    top:0;

    z-index:999;

    box-shadow:
    0 2px 10px rgba(0,0,0,.05);

}

/* =========================
LEFT BUTTONS
========================= */

.top-links{

    display:flex;

    gap:12px;

    flex-wrap:wrap;

}

.top-links a{

    text-decoration:none;

    padding:14px 24px;

    border-radius:16px;

    font-size:16px;

    font-weight:700;

    color:#fff;

    transition:.2s;

}

.top-links a:hover{

    transform:translateY(-2px);

}

.facility-login{

    background:#2563eb;

}

.staff-login{

    background:#0f172a;

}

/* =========================
LANGUAGE
========================= */

.lang-right{

    display:flex;

    gap:12px;

    flex-wrap:wrap;

}

.lang-btn{

    border:none;

    cursor:pointer;

    padding:14px 22px;

    border-radius:16px;

    font-size:16px;

    font-weight:700;

    background:#dbe1ea;

    color:#2563eb;

    transition:.2s;

}

.active-lang{

    background:#16a34a !important;

    color:#fff !important;

}

/* =========================
HERO
========================= */

.hero{

    width:100%;

    background:#111827;

    display:flex;

    justify-content:center;

    align-items:center;

    overflow:hidden;

    padding:20px;

}

.hero-inner{

    position:relative;

    width:100%;

    max-width:1500px;

}

.hero-image{

    width:100%;

    height:auto;

    display:block;

    border-radius:28px;

    object-fit:contain;

}

/* =========================
POWERED
========================= */

.powered-box{

    position:absolute;

    left:26px;

    bottom:26px;

    background:rgba(0,0,0,.75);

    color:#fff;

    padding:14px 24px;

    border-radius:40px;

    font-size:15px;

    font-weight:700;

    backdrop-filter:blur(8px);

}

/* =========================
ABOUT
========================= */

.about{

    text-align:center;

    padding:90px 20px 40px;

}

.about h2{

    font-size:60px;

    color:#1e3a6d;

    margin-bottom:20px;

    font-weight:900;

}

.about p{

    font-size:25px;

    color:#6b7280;

    max-width:1100px;

    margin:auto;

    line-height:1.9;

}

/* =========================
QUOTE
========================= */

.quote-header{

    text-align:center;

    padding:40px 20px 24px;

}

.quote-header h2{

    font-size:70px;

    color:#1e3a6d;

    margin-bottom:18px;

    line-height:1.1;

    font-weight:900;

}

.quote-header p{

    font-size:24px;

    color:#6b7280;

    max-width:1000px;

    margin:auto;

    line-height:1.8;

}

/* =========================
SERVICES
========================= */

.services{

    width:100%;

    max-width:1500px;

    margin:auto;

    padding:60px 60px 140px;

    display:grid;

    grid-template-columns:
    repeat(3,340px);

    justify-content:center;

    gap:28px;

    align-items:start;

}

/* =========================
SMART LAYOUTS
========================= */

.services.layout-1{

    grid-template-columns:
    340px;

}

.services.layout-2{

    grid-template-columns:
    repeat(2,340px);

}

.services.layout-4{

    grid-template-columns:
    repeat(2,340px);

}

.services.layout-5{

    grid-template-columns:
    repeat(3,340px);

    justify-content:center;

}

.services.layout-5 .card:nth-child(4){

    grid-column:1 / span 1;

    transform:translateX(184px);

}

.services.layout-5 .card:nth-child(5){

    grid-column:2 / span 1;

    transform:translateX(184px);

}

/* =========================
CARD
========================= */

.card{

    width:340px;

    background:#fff;

    border-radius:26px;

    overflow:hidden;

    box-shadow:
    0 10px 30px rgba(0,0,0,.10);

    transition:.25s;

}

.card:hover{

    transform:
    translateY(-8px);

    box-shadow:
    0 16px 40px rgba(37,99,235,.18);

}

.card-image{

    width:100%;

    height:240px;

    object-fit:contain;

    object-position:center;

    background:#eef2f7;

    padding:8px;

}

.card-body{

    padding:24px;

    text-align:center;

}

.card h3{

    font-size:30px;

    margin-bottom:12px;

    color:#111827;

    font-weight:800;

}

.card p{

    font-size:17px;

    color:#6b7280;

    line-height:1.9;

    min-height:120px;

    word-break:break-word;

}

.card-btn{

    display:flex;

    align-items:center;

    justify-content:center;

    width:100%;

    height:58px;

    margin-top:20px;

    background:#2563eb;

    color:#fff !important;

    text-decoration:none;

    border-radius:16px;

    font-size:20px;

    font-weight:800;

    transition:.2s;

}

.card-btn:hover{

    background:#1d4ed8;

}

/* =========================
AUTO CENTER LAST ROW
========================= */

.services .card:last-child:nth-child(3n + 1){

    grid-column:2;

}

.services .card:nth-last-child(2):nth-child(3n + 1){

    grid-column:1;

}

.services .card:last-child:nth-child(3n + 2){

    grid-column:2;

}

/* =========================
EXTRA
========================= */

.extra-sections{

    width:100%;

    max-width:1400px;

    margin:auto;

    padding:40px 60px 140px;

    display:flex;

    flex-direction:column;

    gap:28px;

}

.extra-box{

    width:100%;

    background:#fff;

    border-radius:28px;

    padding:44px;

    box-shadow:
    0 10px 30px rgba(0,0,0,.08);

    transition:.25s;

}

.extra-box:hover{

    transform:
    translateY(-6px);

}

.extra-box h3{

    font-size:42px;

    color:#1e3a6d;

    margin-bottom:22px;

    font-weight:900;

    line-height:1.2;

}

.extra-box p{

    font-size:22px;

    color:#6b7280;

    line-height:2;

    word-break:break-word;

}

/* =========================
CONTACT
========================= */

.contact-section{

    text-align:center;

    padding:80px 20px;

    background:#fff;

    font-size:24px;

    line-height:2.2;

    color:#111827;

}

.contact-section strong{

    font-size:42px;

}

/* =========================
FOOTER
========================= */

footer{

    background:#111827;

    color:#fff;

    text-align:center;

    padding:30px;

    font-size:20px;

    font-weight:700;

}

/* =========================
HIDE GOOGLE BAR
========================= */

.goog-te-banner-frame.skiptranslate{

    display:none !important;

}

body{

    top:0 !important;

}

/* =========================
MOBILE
========================= */

@media(max-width:768px){

    .top-bar{

        flex-direction:column;

        align-items:stretch;

        gap:12px;

        padding:14px;

    }

    .top-links,
    .lang-right{

        width:100%;

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:10px;

    }

    .top-links a,
    .lang-btn{

        width:100%;

        text-align:center;

        font-size:13px;

        padding:12px 8px;

        border-radius:12px;

    }

    .hero{

        padding:0;

    }

    .hero-inner{

        width:100%;

        max-width:100%;

    }

    .hero-image{

        width:100%;

        height:auto;

        display:block;

        border-radius:0;

        object-fit:contain;

    }

    .powered-box{

        left:12px;

        bottom:12px;

        font-size:11px;

        padding:8px 14px;

    }

    .about{

        padding:60px 16px 20px;

    }

    .about h2{

        font-size:38px;

    }

    .about p{

        font-size:18px;

        line-height:1.9;

    }

    .quote-header{

        padding:36px 16px 18px;

    }

    .quote-header h2{

        font-size:50px;

    }

    .quote-header p{

        font-size:18px;

        line-height:1.8;

    }

    .services{

        width:100%;

        padding:20px 14px 80px;

        display:grid;

        grid-template-columns:1fr !important;

        gap:22px;

    }

    .card{

        width:100%;

        max-width:100%;

        border-radius:22px;

    }

    .card-image{

        height:240px;

    }

    .card-body{

        padding:20px;

    }

    .card h3{

        font-size:26px;

    }

    .card p{

        font-size:16px;

        min-height:auto;

    }

    .card-btn{

        height:54px;

        font-size:18px;

    }

    .extra-sections{

        padding:20px 14px 80px;

        gap:18px;

    }

    .extra-box{

        padding:22px !important;

        border-radius:20px !important;

    }

    .extra-box h3{

        font-size:28px !important;

    }

    .extra-box p{

        font-size:16px !important;

    }

    .contact-section{

        font-size:18px;

        padding:60px 14px;

    }

    .contact-section strong{

        font-size:32px;

    }

    footer{

        font-size:18px;

    }

}

</style>

</head>

<body>

<div class="top-bar">

    <div class="top-links">

        <a
        href="companies/company-login.html"
        class="facility-login">

            Facility Login

        </a>

        <a
        href="login.html"
        class="staff-login">

            Staff Login

        </a>

    </div>

    <div class="lang-right">

        <button
        id="lang-en"
        class="lang-btn active-lang"
        onclick="setLang('en')">

            English

        </button>

        <button
        id="lang-es"
        class="lang-btn"
        onclick="setLang('es')">

            Spanish

        </button>

    </div>

</div>

<section class="hero">

    <div class="hero-inner">

        <img
        class="hero-image"
        src="/assets/hero.jpeg"
        alt="Hero">

        <div class="powered-box">

            Powered by GH Mobility

        </div>

    </div>

</section>

<section class="about">

    <h2 id="aboutTitle"></h2>

    <p id="aboutText"></p>

</section>

<section class="quote-header">

    <h2 id="quoteTitle"></h2>

    <p id="quoteText"></p>

</section>

<section
class="services"
id="servicesContainer">
</section>

<section
class="extra-sections">

    <div
    class="extra-box"
    id="extraBox1">

        <h3 id="extra1TitleView"></h3>

        <p id="extra1TextView"></p>

    </div>

    <div
    class="extra-box"
    id="extraBox2">

        <h3 id="extra2TitleView"></h3>

        <p id="extra2TextView"></p>

    </div>

</section>

<div class="contact-section">

    <strong id="contactTitleView"></strong>

    <br><br>

    📞
    <span id="contactPhoneView"></span>

    <br>

    📧
    <span id="contactEmailView"></span>

</div>

<footer id="footerView"></footer>

<script src="/core/branding.js"></script>

<div id="google_translate_element"
style="
position:fixed;
right:-9999px;
bottom:-9999px;
opacity:0;
"></div>

<script>

function googleTranslateElementInit(){

    new google.translate.TranslateElement({

        pageLanguage:"en",
        includedLanguages:"en,es",
        autoDisplay:false

    },
    "google_translate_element");

}

</script>

<script src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>

<script>

let currentLang = "en";

/* =========================
LANG BUTTONS
========================= */

function updateLangButtons(){

    document
    .querySelectorAll(".lang-btn")
    .forEach(btn=>{

        btn.classList.remove(
            "active-lang"
        );

    });

    document
    .getElementById(
        "lang-" + currentLang
    )
    .classList.add(
        "active-lang"
    );

}

/* =========================
TRANSLATE
========================= */

function triggerGoogleTranslate(lang){

    const select =
    document.querySelector(
        ".goog-te-combo"
    );

    if(!select) return;

    select.value = lang;

    select.dispatchEvent(
        new Event("change")
    );

}

/* =========================
EXTRA BOX THEME
========================= */

function applyExtraBoxTheme(){

    const data =
    Branding.data || {};

    const boxes =
    document.querySelectorAll(
        ".extra-box"
    );

    boxes.forEach(box=>{

        box.style.background =
        data.extraBoxBg || "#fff";

        box.style.border =
        `${data.extraBoxBorderSize || 2}px solid ${data.extraBoxBorder || "#dbeafe"}`;

        box.style.borderRadius =
        `${data.extraBoxRadius || 28}px`;

        box.style.padding =
        `${data.extraBoxPadding || 44}px`;

        box.style.textAlign =
        data.extraBoxAlign || "center";

        box.style.boxShadow =

        data.extraBoxShadow

        ? "0 10px 30px rgba(0,0,0,.10)"

        : "none";

    });

    document
    .querySelectorAll(".extra-box h3")
    .forEach(el=>{

        el.style.color =
        data.extraBoxTitleColor ||
        "#1e3a6d";

        el.style.fontSize =
        `${data.extraBoxTitleSize || 42}px`;

    });

    document
    .querySelectorAll(".extra-box p")
    .forEach(el=>{

        el.style.color =
        data.extraBoxTextColor ||
        "#6b7280";

        el.style.fontSize =
        `${data.extraBoxTextSize || 22}px`;

    });

}

/* =========================
SERVICES LAYOUT
========================= */

function updateServicesLayout(){

    const services =
    document.getElementById(
        "servicesContainer"
    );

    if(!services) return;

    const count =
    services.querySelectorAll(
        ".card"
    ).length;

    services.classList.remove(
        "layout-1",
        "layout-2",
        "layout-4",
        "layout-5"
    );

    if(count === 1){

        services.classList.add(
            "layout-1"
        );

    }

    else if(count === 2){

        services.classList.add(
            "layout-2"
        );

    }

    else if(count === 4){

        services.classList.add(
            "layout-4"
        );

    }

    else if(count === 5){

        services.classList.add(
            "layout-5"
        );

    }

}

/* =========================
RENDER
========================= */

function renderPage(){

    const data =
    Branding.data || {};

    document.title =
    data.companyName ||
    "Sunbeam Transportation";

    document.querySelector(
        ".hero-image"
    ).src =

    data.heroImage ||
    "/assets/hero.jpeg";

    document.getElementById(
    "aboutTitle"
    ).innerText =

    data.aboutTitle || "";

    document.getElementById(
    "aboutText"
    ).innerText =

    data.aboutText || "";

    document.getElementById(
    "quoteTitle"
    ).innerText =

    data.quoteTitle || "";

    document.getElementById(
    "quoteText"
    ).innerText =

    data.quoteText || "";

    /* EXTRA 1 */

    const extra1 =
    document.getElementById(
        "extraBox1"
    );

    extra1.style.display =

    data.extra1Active === false
    ? "none"
    : "block";

    document.getElementById(
    "extra1TitleView"
    ).innerText =

    data.extra1Title || "";

    document.getElementById(
    "extra1TextView"
    ).innerHTML =

    data.extra1Text || "";

    /* EXTRA 2 */

    const extra2 =
    document.getElementById(
        "extraBox2"
    );

    extra2.style.display =

    data.extra2Active === false
    ? "none"
    : "block";

    document.getElementById(
    "extra2TitleView"
    ).innerText =

    data.extra2Title || "";

    document.getElementById(
    "extra2TextView"
    ).innerHTML =

    data.extra2Text || "";

    /* CONTACT */

    document.getElementById(
    "contactTitleView"
    ).innerText =

    data.contactTitle || "";

    document.getElementById(
    "contactPhoneView"
    ).innerText =

    data.contactPhone || "";

    document.getElementById(
    "contactEmailView"
    ).innerText =

    data.contactEmail || "";

    document.getElementById(
    "footerView"
    ).innerText =

    data.footerText || "";

    /* SERVICES */

    Branding.renderHomepageCards(
        "servicesContainer",
        currentLang
    );

    updateServicesLayout();

    /* APPLY THEME */

    applyExtraBoxTheme();

    updateLangButtons();

}

/* =========================
LANG SWITCH
========================= */

window.setLang = function(lang){

    currentLang = lang;

    triggerGoogleTranslate(lang);

    renderPage();

};

/* =========================
INIT
========================= */

window.addEventListener(
"DOMContentLoaded",
async ()=>{

    await Branding.load();

    renderPage();

});

</script>

</body>
</html>