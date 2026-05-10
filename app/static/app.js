/* ===========================================================
   DYMO Label Editor - main application script (Fabric.js 5.x)
   =========================================================== */

(function() {
"use strict";

// -- Constants ----------------------------------------------
var LABEL_HEIGHT  = 30;
var canvasWidthPx = 200;
var displayZoom   = 4;

// -- DOM refs (all up front) --------------------------------
var $ = function(s) { return document.querySelector(s); };
var printerSel    = $("#printer-select");
var stretchSlider = $("#stretch");
var stretchVal    = $("#stretch-val");
var widthInput    = $("#canvas-width");
var previewEl     = $("#preview-canvas");
var previewCtx    = previewEl.getContext("2d");
var layerList     = $("#layer-list");
var canvasScroll  = $("#canvas-scroll");

// -- Fabric canvas ------------------------------------------
var canvasEl = document.getElementById("label-canvas");
var fc = new fabric.Canvas(canvasEl, {
  backgroundColor: "#ffffff",
  selection: true,
  preserveObjectStacking: true,
});

function calcZoom() {
  // Read from window, not the scroll container — the container's width is
  // influenced by the canvas itself, creating a feedback loop.
  var sidebars = 260 + 240;
  var chrome   = 40 + 24 + 2; // #center padding + #canvas-scroll padding + border
  var available = window.innerWidth - sidebars - chrome;
  if (available < 50) available = 50;
  var z = Math.floor(available / canvasWidthPx);
  if (z > 15) z = 15;
  // Allow fractional zoom so the canvas never exceeds available width
  if (z < 1) z = available / canvasWidthPx;
  return z;
}

function setCanvasSize(w) {
  canvasWidthPx = w;
  displayZoom = calcZoom();
  fc.setWidth(w * displayZoom);
  fc.setHeight(LABEL_HEIGHT * displayZoom);
  // Reset viewport transform fully — setZoom alone leaves stale translate offsets
  fc.setViewportTransform([displayZoom, 0, 0, displayZoom, 0, 0]);
  fc.renderAll();
  updatePreview();
}

setCanvasSize(canvasWidthPx);

window.addEventListener("resize", function() {
  setCanvasSize(canvasWidthPx);
});

// -- Canvas width input -------------------------------------
widthInput.value = canvasWidthPx;
widthInput.addEventListener("change", function() {
  var v = Math.max(30, parseInt(widthInput.value) || 200);
  widthInput.value = v;
  setCanvasSize(v);
});

// -- Stretch factor -----------------------------------------
stretchSlider.addEventListener("input", function() {
  stretchVal.textContent = stretchSlider.value + "\u00d7";
  updatePreview();
});

// ===========================================================
// PRINTERS
// ===========================================================
$("#btn-scan").addEventListener("click", async function() {
  printerSel.innerHTML = '<option value="">Scanning...</option>';
  try {
    var res = await fetch("/api/printers");
    var data = await res.json();
    printerSel.innerHTML = '<option value="">\u2014 none \u2014</option>';
    (data.printers || []).forEach(function(p) {
      var opt = document.createElement("option");
      opt.value = p.address;
      opt.textContent = p.name || p.address;
      printerSel.appendChild(opt);
    });
  } catch (e) {
    printerSel.innerHTML = '<option value="">Scan failed</option>';
  }
});

$("#btn-print").addEventListener("click", async function() {
  var addr = printerSel.value;
  if (!addr) { alert("Select a printer first"); return; }
  var b64 = getActualSizeBase64();
  try {
    var res = await fetch("/api/print", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        printer_address: addr,
        image_data: b64,
        stretch_factor: parseInt(stretchSlider.value),
      }),
    });
    var data = await res.json();
    alert(data.status || "Done");
  } catch (e) {
    alert("Print error: " + e.message);
  }
});

// ===========================================================
// FONT PICKER
// ===========================================================
var FONTS = [
  { group: "Sans-serif",          fonts: ["Inter","Lato","Montserrat","Nunito","Open Sans","Poppins","Raleway","Roboto","Ubuntu"] },
  { group: "Condensed",           fonts: ["Archivo Narrow","Barlow Condensed","Fjalla One","Oswald"] },
  { group: "Display",             fonts: ["Anton","Bebas Neue","Righteous"] },
  { group: "Script / Handwritten",fonts: ["Dancing Script","Lobster","Pacifico","Permanent Marker"] },
  { group: "Monospace / Retro",   fonts: ["Courier Prime","Share Tech Mono","VT323"] },
];

var currentFont = "Roboto";

(function buildFontPicker() {
  var container = $("#font-family-picker");

  var btn = document.createElement("button");
  btn.id = "font-picker-btn";
  btn.textContent = currentFont;
  btn.style.fontFamily = currentFont;

  var dropdown = document.createElement("div");
  dropdown.id = "font-picker-dropdown";

  FONTS.forEach(function(g) {
    var header = document.createElement("div");
    header.className = "fp-group";
    header.textContent = g.group;
    dropdown.appendChild(header);

    g.fonts.forEach(function(font) {
      var item = document.createElement("div");
      item.className = "fp-option" + (font === currentFont ? " fp-selected" : "");
      item.style.fontFamily = font;
      item.textContent = font;
      item.addEventListener("click", function() {
        currentFont = font;
        btn.textContent = font;
        btn.style.fontFamily = font;
        dropdown.querySelectorAll(".fp-option").forEach(function(el) {
          el.classList.toggle("fp-selected", el.textContent === font);
        });
        dropdown.classList.remove("fp-open");
      });
      dropdown.appendChild(item);
    });
  });

  btn.addEventListener("click", function(e) {
    e.stopPropagation();
    dropdown.classList.toggle("fp-open");
  });
  document.addEventListener("click", function() {
    dropdown.classList.remove("fp-open");
  });

  container.appendChild(btn);
  container.appendChild(dropdown);
})();

// ===========================================================
// TEXT TOOL
// ===========================================================
var textBold   = false;
var textItalic = false;

$("#btn-bold").addEventListener("click", function() {
  textBold = !textBold;
  this.classList.toggle("active", textBold);
});
$("#btn-italic").addEventListener("click", function() {
  textItalic = !textItalic;
  this.classList.toggle("active", textItalic);
});
$("#btn-add-text").addEventListener("click", function() {
  var t = new fabric.IText("Label", {
    left: 2,
    top: 2,
    fontFamily: currentFont,
    fontSize: parseInt($("#font-size").value) || 20,
    fontWeight: textBold ? "bold" : "normal",
    fontStyle: textItalic ? "italic" : "normal",
    fill: "#000000",
  });
  fc.add(t);
  fc.setActiveObject(t);
  refreshLayers();
});

// ===========================================================
// SHAPES
// ===========================================================
document.querySelectorAll(".shape-btn").forEach(function(btn) {
  btn.addEventListener("click", function() { addShape(btn.dataset.shape); });
});

function addShape(type) {
  var obj;
  var common = { left:4, top:4, fill:"#000000", stroke:"#000000", strokeWidth:1 };

  switch (type) {
    case "rect":
      obj = new fabric.Rect(Object.assign({}, common, { width:20, height:20 }));
      break;
    case "circle":
      obj = new fabric.Circle(Object.assign({}, common, { radius:10 }));
      break;
    case "ellipse":
      obj = new fabric.Ellipse(Object.assign({}, common, { rx:14, ry:8 }));
      break;
    case "line":
      obj = new fabric.Line([0,0,30,0], Object.assign({}, common, { fill:null }));
      break;
    case "triangle":
      obj = new fabric.Triangle(Object.assign({}, common, { width:20, height:18 }));
      break;
    case "arrow":
      obj = new fabric.Path(
        "M 0 10 L 24 10 L 20 4 M 24 10 L 20 16",
        Object.assign({}, common, { fill: null, strokeWidth: 2, strokeLineCap: "round" })
      );
      break;
    default: return;
  }
  fc.add(obj);
  fc.setActiveObject(obj);
  refreshLayers();
}

// ===========================================================
// FREE DRAW
// ===========================================================
$("#btn-draw").addEventListener("click", function() {
  fc.isDrawingMode = true;
  fc.freeDrawingBrush.color = "#000000";
  fc.freeDrawingBrush.width = parseInt($("#brush-size").value) || 2;
});
$("#btn-draw-off").addEventListener("click", function() {
  fc.isDrawingMode = false;
});
$("#brush-size").addEventListener("input", function() {
  if (fc.freeDrawingBrush) {
    fc.freeDrawingBrush.width = parseInt($("#brush-size").value) || 2;
  }
});

// ===========================================================
// QR CODE
// ===========================================================
$("#btn-qr").addEventListener("click", function() {
  var text = $("#qr-text").value.trim();
  if (!text) { alert("Enter text first"); return; }

  var qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  var moduleCount = qr.getModuleCount();
  var cellSize = Math.max(1, Math.floor(LABEL_HEIGHT / moduleCount));
  var size = moduleCount * cellSize;

  var cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  var ctx = cvs.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (var r = 0; r < moduleCount; r++) {
    for (var c = 0; c < moduleCount; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }

  fabric.Image.fromURL(cvs.toDataURL(), function(img) {
    img.scaleToHeight(LABEL_HEIGHT);
    img.set({ left: 4, top: 0 });
    fc.add(img);
    fc.setActiveObject(img);
    refreshLayers();
  });
});

// ===========================================================
// BARCODE
// ===========================================================
$("#btn-barcode").addEventListener("click", function() {
  var text = $("#qr-text").value.trim();
  if (!text) { alert("Enter text first"); return; }
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, text, {
      format: "CODE128",
      height: LABEL_HEIGHT,
      displayValue: false,
      margin: 0,
    });
  } catch (e) { alert("Barcode error: " + e.message); return; }

  var svgStr = new XMLSerializer().serializeToString(svg);
  fabric.loadSVGFromString(svgStr, function(objects, options) {
    var group = fabric.util.groupSVGElements(objects, options);
    group.scaleToHeight(LABEL_HEIGHT);
    group.set({ left: 4, top: 0 });
    fc.add(group);
    fc.setActiveObject(group);
    refreshLayers();
  });
});
// ===========================================================
// IMAGE UPLOAD
// ===========================================================
$("#image-upload").addEventListener("change", async function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var form = new FormData();
  form.append("file", file);
  try {
    var res = await fetch("/api/convert-image", { method: "POST", body: form });
    var data = await res.json();
    var url = "data:image/png;base64," + data.image;
    fabric.Image.fromURL(url, function(img) {
      img.set({ left: 4, top: 0 });
      fc.add(img);
      fc.setActiveObject(img);
      refreshLayers();
    });
  } catch (err) {
    alert("Image conversion failed: " + err.message);
  }
  e.target.value = "";
});

// ===========================================================
// MATERIAL ICONS
// ===========================================================
var MATERIAL_ICONS = [];
var iconResults = $("#icon-results");

function filterIcons(query) {
  iconResults.innerHTML = "";
  var q = query.toLowerCase();
  var matches = q
    ? MATERIAL_ICONS.filter(function(i) { return i.indexOf(q) !== -1; })
    : MATERIAL_ICONS.slice(0, 40);
  matches.forEach(function(name) {
    var sp = document.createElement("span");
    sp.className = "material-icons";
    sp.textContent = name;
    sp.title = name;
    sp.addEventListener("click", function() { addMaterialIcon(name); });
    iconResults.appendChild(sp);
  });
}

(function loadIcons() {
  iconResults.textContent = "Loading icons…";
  fetch("https://raw.githubusercontent.com/google/material-design-icons/master/font/MaterialIcons-Regular.codepoints")
    .then(function(r) { return r.text(); })
    .then(function(text) {
      MATERIAL_ICONS = text.trim().split("\n").map(function(line) {
        return line.split(" ")[0];
      }).sort();
      filterIcons($("#icon-search").value);
    })
    .catch(function() {
      // Fallback to a basic set if the fetch fails (e.g. no internet)
      MATERIAL_ICONS = [
        "home","star","favorite","search","settings","delete","add","remove",
        "check","close","menu","wifi","bluetooth","battery_full","lock",
        "edit","print","share","folder","phone","email","notifications",
        "alarm","place","map","flag","bookmark","label","info","warning",
        "error","help","power","usb","memory","storage","build","code",
        "music_note","volume_up","mic","camera","photo","person","group",
        "local_shipping","flight","train","directions_car","speed","bolt"
      ].sort();
      filterIcons($("#icon-search").value);
    });
})();

$("#icon-search").addEventListener("input", function(e) { filterIcons(e.target.value); });

function addMaterialIcon(name) {
  var t = new fabric.IText(name, {
    left: 4, top: 2,
    fontFamily: "Material Icons",
    fontSize: 26,
    fill: "#000000",
  });
  fc.add(t);
  fc.setActiveObject(t);
  refreshLayers();
}

// ===========================================================
// LAYERS
// ===========================================================
function refreshLayers() {
  layerList.innerHTML = "";
  var objs = fc.getObjects();
  objs.forEach(function(obj, idx) {
    var li = document.createElement("li");
    if (fc.getActiveObject() === obj) li.classList.add("selected");

    var nameSpan = document.createElement("span");
    nameSpan.className = "layer-name";
    nameSpan.textContent = layerName(obj, idx);
    li.appendChild(nameSpan);

    var visBtn = document.createElement("button");
    visBtn.textContent = obj.visible === false ? "\u25cb" : "\u25c9";
    visBtn.title = "Toggle visibility";
    visBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      obj.visible = !obj.visible;
      fc.renderAll();
      refreshLayers();
    });
    li.appendChild(visBtn);

    li.addEventListener("click", function() {
      fc.setActiveObject(obj);
      fc.renderAll();
      refreshLayers();
    });

    layerList.appendChild(li);
  });
  updatePreview();
}

function layerName(obj, idx) {
  var i = idx + 1;
  if (obj.type === "i-text" || obj.type === "text")
    return i + ': Text "' + (obj.text || "").substring(0,12) + '"';
  if (obj.type === "image") return i + ": Image";
  if (obj.type === "path")  return i + ": Path/Draw";
  if (obj.type === "group") return i + ": Group";
  return i + ": " + (obj.type || "Object");
}

$("#btn-layer-up").addEventListener("click", function() {
  var obj = fc.getActiveObject();
  if (!obj) return;
  fc.bringForward(obj);
  fc.renderAll();
  refreshLayers();
});
$("#btn-layer-down").addEventListener("click", function() {
  var obj = fc.getActiveObject();
  if (!obj) return;
  fc.sendBackwards(obj);
  fc.renderAll();
  refreshLayers();
});
$("#btn-layer-del").addEventListener("click", function() {
  var obj = fc.getActiveObject();
  if (!obj) return;
  fc.remove(obj);
  fc.discardActiveObject();
  refreshLayers();
});

fc.on("object:added",     function() { autoFitCanvas(); refreshLayers(); });
fc.on("object:removed",   function() { autoFitCanvas(); refreshLayers(); });
fc.on("object:modified",  function() { autoFitCanvas(); updatePreview(); });
fc.on("text:changed",     autoFitCanvas);
fc.on("selection:created", refreshLayers);
fc.on("selection:updated", refreshLayers);
fc.on("selection:cleared", refreshLayers);
fc.on("path:created",     function() { refreshLayers(); });

function autoFitCanvas() {
  var objects = fc.getObjects();
  if (!objects.length) return;
  var zoom = fc.getZoom();
  var maxRight = 0;
  objects.forEach(function(obj) {
    var br = obj.getBoundingRect();
    var right = (br.left + br.width) / zoom;
    if (right > maxRight) maxRight = right;
  });
  var needed = Math.max(30, Math.ceil(maxRight) + 4);
  if (needed !== canvasWidthPx) {
    canvasWidthPx = needed;
    widthInput.value = needed;
    setCanvasSize(needed);
  }
}

// ===========================================================
// LIVE PREVIEW
// ===========================================================
function updatePreview() {
  var stretch = parseInt(stretchSlider.value) || 2;

  var offscreen = document.createElement("canvas");
  offscreen.width  = canvasWidthPx;
  offscreen.height = LABEL_HEIGHT;
  var offCtx = offscreen.getContext("2d");

  var origZoom = fc.getZoom();
  var origW = fc.getWidth();
  var origH = fc.getHeight();
  fc.setZoom(1);
  fc.setWidth(canvasWidthPx);
  fc.setHeight(LABEL_HEIGHT);
  fc.renderAll();

  offCtx.drawImage(fc.lowerCanvasEl, 0, 0);

  fc.setZoom(origZoom);
  fc.setWidth(origW);
  fc.setHeight(origH);
  fc.renderAll();

  var imgData = offCtx.getImageData(0, 0, canvasWidthPx, LABEL_HEIGHT);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    var v = lum > 128 ? 255 : 0;
    d[i] = d[i+1] = d[i+2] = v;
    d[i+3] = 255;
  }
  offCtx.putImageData(imgData, 0, 0);

  var dispScale = 3;
  var pw = canvasWidthPx * stretch * dispScale;
  var ph = LABEL_HEIGHT * dispScale;
  previewEl.width  = pw;
  previewEl.height = ph;
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.drawImage(offscreen, 0, 0, pw, ph);
}


// ===========================================================
// EXPORT HELPERS
// ===========================================================
function getActualSizeBase64() {
  var origZoom = fc.getZoom();
  var origW = fc.getWidth();
  var origH = fc.getHeight();
  fc.setZoom(1);
  fc.setWidth(canvasWidthPx);
  fc.setHeight(LABEL_HEIGHT);
  fc.renderAll();

  var dataUrl = fc.toDataURL({ format: "png", multiplier: 4 });

  fc.setZoom(origZoom);
  fc.setWidth(origW);
  fc.setHeight(origH);
  fc.renderAll();

  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

function downloadBlob(blob, filename) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function base64ToBlob(b64, mime) {
  var byteChars = atob(b64);
  var byteNums = new Array(byteChars.length);
  for (var i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNums)], { type: mime });
}

// ===========================================================
// SAVE / LOAD / EXPORT
// ===========================================================
$("#btn-save").addEventListener("click", async function() {
  var name = prompt("Design name:");
  if (!name) return;
  var json = fc.toJSON();
  json._dymo = { width: canvasWidthPx };
  await fetch("/api/saves/" + encodeURIComponent(name), {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(json),
  });
  alert("Saved!");
});

$("#btn-load").addEventListener("click", async function() {
  var res = await fetch("/api/saves");
  var data = await res.json();
  if (!data.saves.length) { alert("No saved designs"); return; }
  var name = prompt("Load design:\n" + data.saves.join("\n"));
  if (!name) return;
  var res2 = await fetch("/api/saves/" + encodeURIComponent(name));
  if (!res2.ok) { alert("Not found"); return; }
  var json = await res2.json();
  if (json._dymo && json._dymo.width) {
    widthInput.value = json._dymo.width;
    setCanvasSize(json._dymo.width);
  }
  fc.loadFromJSON(json, function() {
    fc.renderAll();
    refreshLayers();
  });
});

$("#btn-export-json").addEventListener("click", function() {
  var json = fc.toJSON();
  json._dymo = { width: canvasWidthPx };
  var blob = new Blob([JSON.stringify(json, null, 2)], {type:"application/json"});
  downloadBlob(blob, "label-design.json");
});

$("#btn-import-json").addEventListener("click", function() {
  $("#import-json-input").click();
});
$("#import-json-input").addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var json = JSON.parse(reader.result);
      if (json._dymo && json._dymo.width) {
        widthInput.value = json._dymo.width;
        setCanvasSize(json._dymo.width);
      }
      fc.loadFromJSON(json, function() {
        fc.renderAll();
        refreshLayers();
      });
    } catch (err) { alert("Invalid JSON: " + err.message); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("#btn-export-png").addEventListener("click", function() {
  var b64 = getActualSizeBase64();
  var blob = base64ToBlob(b64, "image/png");
  downloadBlob(blob, "label.png");
});

$("#btn-export-svg").addEventListener("click", function() {
  var origZoom = fc.getZoom();
  var origW = fc.getWidth();
  var origH = fc.getHeight();
  fc.setZoom(1);
  fc.setWidth(canvasWidthPx);
  fc.setHeight(LABEL_HEIGHT);
  fc.renderAll();

  var svg = fc.toSVG();

  fc.setZoom(origZoom);
  fc.setWidth(origW);
  fc.setHeight(origH);
  fc.renderAll();

  var blob = new Blob([svg], {type:"image/svg+xml"});
  downloadBlob(blob, "label.svg");
});

// -- Initialise ---------------------------------------------
refreshLayers();
updatePreview();

})();
