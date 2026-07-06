/* =====================================================
FILE: company-review-shared-server-confirm-FULL-PATCH.txt
PURPOSE:
- This is NOT a partial replacement for review.js.
- This patcher keeps your existing Company Review file COMPLETE.
- It replaces ONLY handleConfirmShared so shared route/order/price comes from server exactly like Dispatch Add Trip.
- It does NOT touch individual trip calculation.
- It does NOT delete UI, add-stop, edit, cancel, tables, eye modal, service pricing, or auto refresh logic.

HOW TO USE:
1) Save this file content as: fix-company-review-shared-confirm.js
2) Put it in your project root.
3) Run:
   node fix-company-review-shared-confirm.js

It will patch:
- public/companies/review.js
- public/company/review.js
- public/review.js
- review.js
whichever exists first.

Backup will be created automatically beside the file.
===================================================== */

const fs = require("fs");
const path = require("path");

const candidates = [
  path.join(process.cwd(), "public", "companies", "review.js"),
  path.join(process.cwd(), "public", "company", "review.js"),
  path.join(process.cwd(), "public", "review.js"),
  path.join(process.cwd(), "review.js")
];

const filePath = candidates.find(p => fs.existsSync(p));

if(!filePath){
  console.error("Company review.js not found. Put this script in project root or edit candidates path.");
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

const startMarker = "async function handleConfirmShared(btn){";
const start = src.indexOf(startMarker);

if(start === -1){
  console.error("handleConfirmShared function not found in:", filePath);
  process.exit(1);
}

function findFunctionEnd(code, startIndex){
  const braceStart = code.indexOf("{", startIndex);
  if(braceStart === -1) return -1;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for(let i = braceStart; i < code.length; i++){
    const ch = code[i];
    const next = code[i + 1];

    if(inLineComment){
      if(ch === "\n") inLineComment = false;
      continue;
    }

    if(inBlockComment){
      if(ch === "*" && next === "/"){
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if(inString){
      if(escaped){
        escaped = false;
        continue;
      }
      if(ch === "\\"){
        escaped = true;
        continue;
      }
      if(ch === quote){
        inString = false;
        quote = "";
      }
      continue;
    }

    if(ch === "/" && next === "/"){
      inLineComment = true;
      i++;
      continue;
    }

    if(ch === "/" && next === "*"){
      inBlockComment = true;
      i++;
      continue;
    }

    if(ch === '"' || ch === "'" || ch === "`"){
      inString = true;
      quote = ch;
      continue;
    }

    if(ch === "{") depth++;
    if(ch === "}"){
      depth--;
      if(depth === 0){
        return i + 1;
      }
    }
  }

  return -1;
}

const end = findFunctionEnd(src, start);

if(end === -1){
  console.error("Could not find end of handleConfirmShared function.");
  process.exit(1);
}

const replacement = String.raw`async function handleConfirmShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group =
    getSharedGroups().find(g =>
      getSharedKey(g[0]) === groupId
    );

  if(!group || !group.length){
    throw new Error("Shared group not found");
  }

  const first = group[0];

  if(!first?._id){
    throw new Error("Shared trip id missing");
  }

  const ok = confirm("Confirm this shared trip?");
  if(!ok) return;

  const oldText = btn.textContent;

  try{

    btn.disabled = true;
    btn.textContent = "Confirming...";

    /*
      SERVER ONLY - SAME AS DISPATCH ADD TRIP
      Do not calculate shared route in Company Review frontend.
      Do not call Google Directions from Company Review confirm shared.
      Do not calculate shared price in frontend.
      Server endpoint must return/save:
      - ordered passengers
      - routePoints / routePlan / sharedRoutePlan
      - miles / minutes / googleRoute
      - priceAmount / finalPrice / pricePerPassenger
    */

    await confirmTripOnServer(first._id);

    await reloadTrips();

  }catch(err){

    console.error("CONFIRM SHARED SERVER ERROR:", err);

    throw new Error(
      err.message ||
      "Shared confirm failed"
    );

  }finally{

    btn.disabled = false;
    btn.textContent = oldText || "Confirm";
  }
}`;

const backupPath = filePath + ".backup-before-shared-server-confirm-" + Date.now();
fs.writeFileSync(backupPath, src, "utf8");

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(filePath, src, "utf8");

console.log("DONE: Company Review shared confirm now uses server confirm only.");
console.log("Patched:", filePath);
console.log("Backup:", backupPath);
