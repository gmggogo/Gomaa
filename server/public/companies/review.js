/* =====================================================
FILE: apply-company-review-shared-server-confirm-fix.js
PURPOSE:
- Patch public/companies/review.js
- Make Company Review shared Confirm use the same server confirm flow
  as Dispatch Add Trip: /api/dispatch-reserved-confirm/:id
- No frontend shared route ordering
- No frontend Google Directions for shared confirm
- No frontend shared price calculation

USAGE from project root:
  node apply-company-review-shared-server-confirm-fix.js

It creates a backup next to the original file before writing.
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
  console.error("review.js not found. Put this script in the project root, or edit candidates in the script.");
  process.exit(1);
}

const original = fs.readFileSync(filePath, "utf8");

const startMarker = "async function handleConfirmShared(btn){";
const start = original.indexOf(startMarker);

if(start === -1){
  console.error("handleConfirmShared function not found in:", filePath);
  process.exit(1);
}

function findFunctionEnd(src, functionStart){
  const open = src.indexOf("{", functionStart);
  if(open === -1) return -1;

  let depth = 0;
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for(let i = open; i < src.length; i++){
    const ch = src[i];
    const next = src[i + 1];

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
      if(ch === stringChar){
        inString = false;
        stringChar = "";
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

    if(ch === "\"" || ch === "'" || ch === "`"){
      inString = true;
      stringChar = ch;
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

const end = findFunctionEnd(original, start);

if(end === -1){
  console.error("Could not find end of handleConfirmShared function.");
  process.exit(1);
}

const replacement = `async function handleConfirmShared(btn){
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
      IMPORTANT:
      Company Review shared confirm must use server routing only.
      This matches Dispatch Add Trip confirm flow.

      Do NOT do these in frontend for shared confirm:
      - getServerSharedRoutePoints + calculateRouteMiles
      - Google Directions from browser
      - calculateServerPrice
      - manual updateTrip route payload

      Server endpoint must return/save:
      - ordered passengers
      - sharedRoutePlan / routePlan
      - routePoints
      - miles / minutes
      - priceAmount / finalPrice / pricePerPassenger
      - routeLocked / routeFinalized
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

const updated = original.slice(0, start) + replacement + original.slice(end);

const backupPath = filePath + ".backup-before-shared-server-confirm-" + Date.now();
fs.writeFileSync(backupPath, original, "utf8");
fs.writeFileSync(filePath, updated, "utf8");

console.log("Patched:", filePath);
console.log("Backup:", backupPath);
console.log("Done. Shared confirm now uses server confirm flow only.");
