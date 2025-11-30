let currentResults = [];
let sentimentChart = null;
let confidenceChart = null;

document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
    initializeDragAndDrop();
});

function initializeEventListeners() {
    document.getElementById('analyzeBtn').addEventListener('click', analyzeFileWithBackend);
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('quickAnalyzeBtn').addEventListener('click', analyzeSingleTextWithBackend);
    document.getElementById('evalFileInput')?.addEventListener('change', handleEvalFile);
}

function initializeDragAndDrop() {
    const uploadAreas = document.querySelectorAll('.upload-area');
    uploadAreas.forEach(area => {
        area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
        area.addEventListener('dragleave', () => area.classList.remove('dragover'));
        area.addEventListener('drop', e => {
            e.preventDefault();
            area.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const fileInput = area.querySelector('.file-input');
                fileInput.files = files;
                const placeholder = area.querySelector('.upload-placeholder span');
                placeholder.textContent = `📄 ${files[0].name}`;
                showFileInfo(area.id === 'uploadArea' ? 'fileAnalysisStatus' : 'evaluationResults',
                    `Файл "${files[0].name}" готов к анализу`, 'info');
            }
        });
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        document.querySelector('#uploadArea .upload-placeholder span').textContent = `📄 ${file.name}`;
        showFileInfo('fileAnalysisStatus', `Файл "${file.name}" готов к анализу`, 'info');
    }
}

async function analyzeSingleTextWithBackend() {
    const text = document.getElementById('singleText').value.trim();
    if (!text) { showQuickResult('Введите текст', 'error'); return; }
    try {
        const res = await fetch("/api/analyze_text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();

        const labelMap = ['Нейтральная', 'Положительная', 'Негативная'];

        // Превращаем объект в массив
        const resultsArray = Array.isArray(data) ? data : [data];

        currentResults = resultsArray.map(d => ({
            id: d.id,
            text: d.comment,
            sentiment: d.sentiment_class,
            sentiment_label: labelMap[d.sentiment_class],
            confidence: d.score,
            src: d.src
        }));

        displayResults();
        showQuickResult('Текст проанализирован', 'success');
    } catch (e) { console.error(e); showQuickResult(`Ошибка: ${e.message}`, 'error'); }
}

async function analyzeFileWithBackend() {
    const file = document.getElementById('fileInput').files[0];
    if (!file) { showFileInfo('fileAnalysisStatus', 'Выберите CSV', 'error'); return; }
    showFileInfo('fileAnalysisStatus', '<div class="loading"></div> Анализируем...', 'info');

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function (results) {

            const comments = results.data.map(d => d.text || '');

            try {
                const res = await fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ comments })
                });

                const data = await res.json();
                const resultsArray = Array.isArray(data) ? data : [data];

                const labelMap = ['Нейтральная', 'Положительная', 'Негативная'];

                currentResults = resultsArray.map((d, i) => ({
                    id: i,
                    text: d.comment,
                    sentiment: d.sentiment_class,
                    sentiment_label: labelMap[d.sentiment_class],
                    confidence: d.score,
                    src: d.src
                }));

                showFileInfo('fileAnalysisStatus', `✅ Проанализировано ${currentResults.length} сегментов`, 'success');
                displayResults();
            } catch (e) {
                console.error(e);
                showFileInfo('fileAnalysisStatus', `Ошибка: ${e.message}`, 'error');
            }
        }
    });
}

// === Macro-F1 ===
async function handleEvalFile(e) {
    const file = e.target.files[0]; if (!file) return;
    showFileInfo('evaluationResults', '<div class="loading"></div> Считаем Macro-F1...', 'info');

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function (results) {
            const evalData = results.data
                .filter(d => d.text && d.label !== undefined)
                .map(d => ({ text: d.text, trueLabel: parseInt(d.label) }));

            const comments = evalData.map(d => d.text);

            try {
                const res = await fetch("/api/analyze_text_batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ comments })
                });
                const predictions = await res.json();

                const y_true = evalData.map(d => d.trueLabel);
                const y_pred = predictions.map(d => d.sentiment_class);

                const f1 = await computeMacroF1Backend(y_true, y_pred);
                showFileInfo('evaluationResults', `Macro-F1: ${f1.toFixed(3)}`, 'success');
            } catch (e) { console.error(e); showFileInfo('evaluationResults', `Ошибка: ${e.message}`, 'error'); }
        }
    });
}

async function computeMacroF1Backend(y_true, y_pred) {
    const res = await fetch("/api/macro_f1", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ y_true, y_pred })
    });
    const data = await res.json();
    return data.f1;
}

// === Отображение ===
function displayResults() {
    document.getElementById('resultsSection').style.display = 'block';
    displayStatistics(); displayTable(); displayCharts();
}

function displayStatistics() {
    const stats = {
        total: currentResults.length,
        neutral: currentResults.filter(r => r.sentiment === 0).length,
        positive: currentResults.filter(r => r.sentiment === 1).length,
        negative: currentResults.filter(r => r.sentiment === 2).length
    };
    const statsHtml =
        `<div class="stat-card neutral">${stats.neutral}</div>
         <div class="stat-card positive">${stats.positive}</div>
         <div class="stat-card negative">${stats.negative}</div>
         <div class="stat-card">Всего: ${stats.total}</div>`;
    document.getElementById('statsGrid').innerHTML = statsHtml;
}

function displayTable() {
    let tableHtml = `<table><thead><tr><th>ID</th><th>Текст</th><th>Тональность</th><th>Уверенность</th></tr></thead><tbody>`;
    currentResults.forEach(r => {
        tableHtml += `<tr>
            <td>${r.id}</td>
            <td>${r.text}</td>
            <td class="sentiment-${r.sentiment_label.toLowerCase()}">${r.sentiment_label}</td>
            <td>${(r.confidence * 100).toFixed(1)}%</td>
        </tr>`;
    });
    tableHtml += `</tbody></table>`;
    document.getElementById('resultsTable').innerHTML = tableHtml;
}

function displayCharts() {
    const ctx1 = document.getElementById('sentimentChart').getContext('2d');
    const ctx2 = document.getElementById('confidenceChart').getContext('2d');
    if (sentimentChart) sentimentChart.destroy();
    if (confidenceChart) confidenceChart.destroy();

    const counts = {
        neutral: currentResults.filter(r => r.sentiment === 0).length,
        positive: currentResults.filter(r => r.sentiment === 1).length,
        negative: currentResults.filter(r => r.sentiment === 2).length
    };

    sentimentChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: ['Нейтральные', 'Положительные', 'Негативные'],
            datasets: [{
                data: [counts.neutral, counts.positive, counts.negative],
                backgroundColor: ['#6c757d', '#28a745', '#dc3545']
            }]
        }
    });

    const confRanges = [
        currentResults.filter(r => r.confidence <= 0.2).length,
        currentResults.filter(r => r.confidence > 0.2 && r.confidence <= 0.4).length,
        currentResults.filter(r => r.confidence > 0.4 && r.confidence <= 0.6).length,
        currentResults.filter(r => r.confidence > 0.6 && r.confidence <= 0.8).length,
        currentResults.filter(r => r.confidence > 0.8).length
    ];

    confidenceChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
            datasets: [{
                label: 'Количество текстов',
                data: confRanges,
                backgroundColor: '#667eea'
            }]
        }
    });
}

// === Скачивание CSV только с ID и Label ===
function downloadResultsCSV() {
    if (currentResults.length === 0) {
        alert("Нет данных для скачивания");
        return;
    }

    const header = ["ID", "Label"];
    const rows = currentResults.map(r => [
        r.id,
        r.sentiment
    ]);

    let csvContent = header.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "analysis_results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// === Вспомогательные функции ===
function showFileInfo(id, msg, type) {
    const el = document.getElementById(id);
    el.innerHTML = msg;
    el.className = `status-message status-${type}`;
}

function showQuickResult(msg, type) {
    const el = document.getElementById('quickAnalysisResult');
    el.innerHTML = msg;
    el.className = `status-message status-${type}`;
}
