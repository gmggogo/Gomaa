/* =========================================================
   FILE: public/admin/staff-signin.js

   HEADER SIGN IN

   The server decides whether the button may appear:
   - role supported
   - Payroll Sign In enabled
   - today is checked in schedule
   - today's scheduled hours > 0
   - user has not already signed today

   Device clock does not decide eligibility.
========================================================= */

(function(){

  if(
    window.SUNBEAM_STAFF_SIGNIN
  ){
    return;
  }

  window.SUNBEAM_STAFF_SIGNIN = true;

  const token =
    String(
      localStorage.getItem("token") ||
      ""
    );

  if(!token){
    return;
  }

  function authHeaders(
    json = false
  ){

    return {
      ...(json
        ? {
            "Content-Type":
              "application/json"
          }
        : {}),

      Authorization:
        `Bearer ${token}`
    };
  }

  function makeButton(){

    let button =
      document.getElementById(
        "staffPayrollSignInBtn"
      );

    if(button){
      return button;
    }

    button =
      document.createElement(
        "button"
      );

    button.id =
      "staffPayrollSignInBtn";

    button.type =
      "button";

    button.textContent =
      "SIGN IN";

    button.style.cssText = [
      "display:none",
      "height:34px",
      "padding:0 13px",
      "border:1px solid #d4a900",
      "border-radius:10px",
      "background:#0f2747",
      "color:#ffd21f",
      "font-size:11px",
      "font-weight:900",
      "cursor:pointer",
      "margin-left:8px",
      "white-space:nowrap"
    ].join(";");

    const staffName =
      document.getElementById(
        "staffDisplayName"
      );

    const roleTitle =
      document.getElementById(
        "roleTitle"
      );

    const target =
      staffName ||
      roleTitle;

    if(!target){
      return null;
    }

    if(target.parentElement){

      target.parentElement
        .appendChild(
          button
        );

    }else{

      target.insertAdjacentElement(
        "afterend",
        button
      );
    }

    return button;
  }

  async function loadStatus(){

    const button =
      makeButton();

    if(!button){
      return;
    }

    try{

      const response =
        await fetch(
          "/api/payroll/staff-signin/status",
          {
            headers:
              authHeaders(),
            cache:"no-store"
          }
        );

      const data =
        await response
          .json()
          .catch(
            ()=>({})
          );

      if(
        !response.ok ||
        data.showSignIn !== true
      ){

        button.style.display =
          "none";

        return;
      }

      button.style.display =
        "inline-flex";

      button.style.alignItems =
        "center";

      button.style.justifyContent =
        "center";

      button.disabled =
        false;

      button.textContent =
        "SIGN IN";

      button.title =
        data.creditedHours
          ? `Scheduled today: ${data.creditedHours} hours`
          : "Sign in for today's scheduled work";

    }catch(error){

      /*
        Header should never break because
        attendance status failed.
      */
      console.log(
        "STAFF SIGN IN STATUS ERROR:",
        error
      );

      button.style.display =
        "none";
    }
  }

  async function signIn(){

    const button =
      document.getElementById(
        "staffPayrollSignInBtn"
      );

    if(!button){
      return;
    }

    if(
      !confirm(
        "Confirm SIGN IN for today's scheduled work?"
      )
    ){
      return;
    }

    button.disabled = true;
    button.textContent =
      "SIGNING...";

    try{

      const response =
        await fetch(
          "/api/payroll/staff-signin",
          {
            method:"POST",
            headers:
              authHeaders(true),
            body:
              JSON.stringify({})
          }
        );

      const data =
        await response
          .json()
          .catch(
            ()=>({})
          );

      if(!response.ok){

        throw new Error(
          data.message ||
          "Sign In failed"
        );
      }

      button.textContent =
        "SIGNED";

      setTimeout(
        ()=>{
          button.style.display =
            "none";
        },
        900
      );

    }catch(error){

      button.disabled = false;
      button.textContent =
        "SIGN IN";

      alert(
        error.message
      );
    }
  }

  function init(){

    const button =
      makeButton();

    if(!button){
      return;
    }

    button.addEventListener(
      "click",
      signIn
    );

    loadStatus();
  }

  /*
    header.js loads this script only after
    header.html has been injected.
  */
  init();

})();