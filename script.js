"use strict";

let xValues = [];
let yValues = [];
let timer = null;
let audioContext = null;
let oscillator = null;
let gainNode = null;

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  const info = $("info");
  info.textContent = message;
  info.classList.toggle("error", isError);
}

function changeMode() {
  const mode = $("mode").value;
  $("normalInputs").hidden = mode !== "normal";
  $("parametricInputs").hidden = mode !== "parametric";
  $("polarInputs").hidden = mode !== "polar";
  updateFormulaDisplay();
}

function updateFormulaDisplay() {
  const mode = $("mode").value;
  if (mode === "normal") $("formulaDisplay").textContent = `y = ${$("formulaY").value}`;
  if (mode === "parametric") $("formulaDisplay").textContent = `x = ${$("formulaX").value} / y = ${$("formulaParamY").value}`;
  if (mode === "polar") $("formulaDisplay").textContent = `r = ${$("formulaR").value}`;
}

function setExample(mode, formula) {
  $("mode").value = mode;
  changeMode();
  if (mode === "normal") $("formulaY").value = formula;
  if (mode === "polar") $("formulaR").value = formula;
  drawGraph();
}

function setParamExample(xFormula, yFormula) {
  $("mode").value = "parametric";
  changeMode();
  $("formulaX").value = xFormula;
  $("formulaParamY").value = yFormula;
  drawGraph();
}

function evaluateFinite(expression, scope) {
  const value = math.evaluate(expression, scope);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function drawGraph() {
  stopSound(false);
  updateFormulaDisplay();
  const mode = $("mode").value;
  xValues = [];
  yValues = [];

  try {
    if (mode === "normal") {
      const formula = $("formulaY").value.trim();
      if (!formula) throw new Error("数式を入力してください。");
      for (let x = -10; x <= 10.0001; x += 0.05) {
        const y = evaluateFinite(formula, { x });
        if (y !== null) { xValues.push(x); yValues.push(y); }
      }
    }

    if (mode === "parametric") {
      const formulaX = $("formulaX").value.trim();
      const formulaY = $("formulaParamY").value.trim();
      if (!formulaX || !formulaY) throw new Error("xとyの数式を入力してください。");
      for (let t = 0; t <= Math.PI * 2 + 0.0001; t += 0.01) {
        const x = evaluateFinite(formulaX, { t });
        const y = evaluateFinite(formulaY, { t });
        if (x !== null && y !== null) { xValues.push(x); yValues.push(y); }
      }
    }

    if (mode === "polar") {
      const formula = $("formulaR").value.trim();
      if (!formula) throw new Error("rの数式を入力してください。");
      for (let theta = 0; theta <= Math.PI * 2 + 0.0001; theta += 0.01) {
        const r = evaluateFinite(formula, { theta });
        if (r !== null) {
          xValues.push(r * Math.cos(theta));
          yValues.push(r * Math.sin(theta));
        }
      }
    }
  } catch (error) {
    xValues = [];
    yValues = [];
    setStatus(`数式を確認してください：${error.message || "計算できませんでした。"}`, true);
    return;
  }

  if (xValues.length < 2) {
    setStatus("描画できる点がありません。数式または定義域を確認してください。", true);
    return;
  }

  const graphData = {
    x: xValues,
    y: yValues,
    mode: "lines",
    type: "scatter",
    name: "Formula",
    line: { color: "#60a5fa", width: 4 }
  };

  const pointData = {
    x: [xValues[0]],
    y: [yValues[0]],
    mode: "markers",
    type: "scatter",
    name: "Playhead",
    marker: { color: "#ef4444", size: 13 }
  };

  const layout = {
    autosize: true,
    paper_bgcolor: "#0b0f19",
    plot_bgcolor: "#0b0f19",
    font: { color: "white" },
    xaxis: { title: "x", gridcolor: "#1f2937", zerolinecolor: "#e5e7eb", autorange: true },
    yaxis: { title: "y", gridcolor: "#1f2937", zerolinecolor: "#e5e7eb", autorange: true },
    showlegend: false,
    margin: { l: 55, r: 20, t: 20, b: 55 }
  };

  if (mode !== "normal") layout.yaxis.scaleanchor = "x";

  Plotly.newPlot("graph", [graphData, pointData], layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"]
  });

  setStatus(`${xValues.length.toLocaleString()}点を描画しました。再生ボタンで音を確認できます。`);
}

function yToFrequency(y) {
  let frequency = 440 * Math.pow(2, y / 2);
  return Math.min(1200, Math.max(80, frequency));
}

function updateVolumeLabel() {
  $("volumeValue").textContent = `${Math.round(Number($("volume").value) * 100)}%`;
  if (gainNode && audioContext) {
    gainNode.gain.setTargetAtTime(Number($("volume").value) * 0.22, audioContext.currentTime, 0.02);
  }
}

function updateSpeedLabel() {
  $("speedValue").textContent = `${Number($("speed").value).toFixed(1)}×`;
}

async function playSound() {
  stopSound(false);
  if (xValues.length === 0) drawGraph();
  if (xValues.length === 0) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    oscillator.type = $("wave").value;
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(Number($("volume").value) * 0.22, audioContext.currentTime + 0.04);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();

    let index = 0;
    const speed = Number($("speed").value);
    const intervalMs = Math.max(8, Math.round(20 / speed));

    timer = window.setInterval(() => {
      if (index >= xValues.length) {
        stopSound();
        return;
      }
      const x = xValues[index];
      const y = yValues[index];
      const frequency = yToFrequency(y);
      oscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.01);
      Plotly.restyle("graph", { x: [[x]], y: [[y]] }, [1]);
      setStatus(`x = ${x.toFixed(2)} / y = ${y.toFixed(2)} / ${frequency.toFixed(1)} Hz`);
      index += 1;
    }, intervalMs);
  } catch (error) {
    stopSound(false);
    setStatus("音声を開始できませんでした。ブラウザの音声設定を確認してください。", true);
  }
}

function stopSound(showMessage = true) {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (gainNode && audioContext && audioContext.state !== "closed") {
    try { gainNode.gain.cancelScheduledValues(audioContext.currentTime); gainNode.gain.setValueAtTime(0, audioContext.currentTime); } catch (_) {}
  }
  if (oscillator) {
    try { oscillator.stop(); oscillator.disconnect(); } catch (_) {}
    oscillator = null;
  }
  if (audioContext) {
    const context = audioContext;
    audioContext = null;
    context.close().catch(() => {});
  }
  gainNode = null;
  if (showMessage && xValues.length) setStatus("再生を停止しました。");
}

window.addEventListener("DOMContentLoaded", () => {
  ["formulaY", "formulaX", "formulaParamY", "formulaR"].forEach((id) => {
    $(id).addEventListener("input", updateFormulaDisplay);
    $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") drawGraph();
    });
  });
  $("volume").addEventListener("input", updateVolumeLabel);
  $("speed").addEventListener("input", updateSpeedLabel);
  updateVolumeLabel();
  updateSpeedLabel();
  changeMode();
  drawGraph();
});
