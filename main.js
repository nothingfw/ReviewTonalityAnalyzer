let currentResults = [];
let currentEvaluation = null;
let sentimentChart = null;
let confidenceChart = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeDragAndDrop();
});

function initializeEventListeners() {
    document.getElementById('analyzeBtn').addEventListener('click', analyzeFileWithBackend);
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('quickAnalyzeBtn').addEventListener('click', analyzeSingleTextWithBackend);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCsv);
    document.getElementById('downloadJsonBtn').addEventListener('click', downloadJson);
}

function initializeDragAndDrop() {
    const uploadAreas = document.querySelectorAll('.upload-area');

    uploadAreas.forEach(area => {
        area.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });
        area.addEventListener('dragleave', function() {
            this.classList.remove('dragover');
        });
        area.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const fileInput = this.querySelector('.file-input');
                fileInput.files = files;

                const placeholder = this.querySelector('.upload-placeholder span');
                placeholder.textContent = `📄 ${files[0].name}`;

                showFileInfo(this.id === 'uploadArea' ? 'fileAnalysisStatus' : 'evaluationResults',
                    `Файл "${files[0].name}" готов к анализу`, 'info');
            }
        });
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const placeholder = document.querySelector('#uploadArea .upload-placeholder span');
        placeholder.textContent = `📄 ${file.name}`;
        showFileInfo('fileAnalysisStatus', `Файл "${file.name}" готов к анализу`, 'info');
    }
}

// === Анализ одного текста через бекенд ===
async function analyzeSingleTextWithBackend() {
    const textArea = document.getElementById('singleText');
    const text = textArea.value.trim();

    if (!text) {
        showQuickResult('Пожалуйста, введите текст для анализа', 'error');
        return;
    }

    try {
        const response = await fetch("http://127.0.0.1:8000/analyze_text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        const data = await response.json();

        // Привязываем текстовую метку к числовому классу
        const labelMap = ['Neutral', 'Positive', 'Negative'];

        currentResults = [{
            text: data.comment,
            sentiment: data.sentiment_class,
            sentiment_label: labelMap[data.sentiment_class],
            confidence: data.score,
            src: data.source
        }];

        displayResults();
        showQuickResult(`Текст проанализирован через бекенд`, 'success');

    } catch (error) {
        console.error(error);
        showQuickResult(`Ошибка анализа: ${error.message}`, 'error');
    }
}

// === Анализ CSV файла через бекенд ===
async function analyzeFileWithBackend() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        showFileInfo('fileAnalysisStatus', 'Пожалуйста, выберите CSV файл', 'error');
        return;
    }

    showFileInfo('fileAnalysisStatus', '<div class="loading"></div> Анализируем файл...', 'info');

    try {
        const text = await file.text();
        const rows = text.split('\n').slice(1).filter(r => r.trim());
        const comments = rows.map(r => r.split(',')[0].replace(/"/g,''));

        if (!comments.length) {
            showFileInfo('fileAnalysisStatus', 'Файл не содержит текстов для анализа', 'error');
            return;
        }

        const response = await fetch("http://127.0.0.1:8000/analyze_text", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ comments })
        });
        const data = await response.json();

        const labelMap = ['Negative', 'Neutral', 'Positive'];

        currentResults = data.map(d => ({
            text: d.comment,
            sentiment: d.sentiment_class,
            sentiment_label: labelMap[d.sentiment_class],
            confidence: d.score,
            src: d.source
        }));

        showFileInfo('fileAnalysisStatus', `✅ Проанализировано ${currentResults.length} текстов`, 'success');
        displayResults();

    } catch (error) {
        console.error(error);
        showFileInfo('fileAnalysisStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// === Отображение результатов ===
function displayResults() {
    const section = document.getElementById('resultsSection');
    section.style.display = 'block';
    displayStatistics();
    displayTable();
    displayCharts();
}

function displayStatistics() {
    const stats = {
        total: currentResults.length,
        neutral: currentResults.filter(r => r.sentiment === 1).length,
        positive: currentResults.filter(r => r.sentiment === 2).length,
        negative: currentResults.filter(r => r.sentiment === 0).length
    };

    const statsHtml = `
        <div class="stat-card neutral">${stats.neutral}</div>
        <div class="stat-card positive">${stats.positive}</div>
        <div class="stat-card negative">${stats.negative}</div>
        <div class="stat-card">Всего: ${stats.total}</div>
    `;

    document.getElementById('statsGrid').innerHTML = statsHtml;
}

function displayTable() {
    let tableHtml = `
        <table>
            <thead><tr><th>Текст</th><th>Тональность</th><th>Уверенность</th></tr></thead>
            <tbody>
    `;

    currentResults.forEach(r => {
        tableHtml += `
            <tr>
                <td>${r.text}</td>
                <td class="sentiment-${r.sentiment_label.toLowerCase()}">${r.sentiment_label}</td>
                <td>${(r.confidence*100).toFixed(1)}%</td>
            </tr>
        `;
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
        neutral: currentResults.filter(r => r.sentiment === 1).length,
        positive: currentResults.filter(r => r.sentiment === 2).length,
        negative: currentResults.filter(r => r.sentiment === 0).length
    };

    sentimentChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: ['Нейтральные', 'Положительные', 'Негативные'],
            datasets: [{ data: [counts.neutral, counts.positive, counts.negative], backgroundColor: ['#6c757d','#28a745','#dc3545'] }]
        }
    });

    const confidenceRanges = [
        currentResults.filter(r => r.confidence <= 0.2).length,
        currentResults.filter(r => r.confidence > 0.2 && r.confidence <= 0.4).length,
        currentResults.filter(r => r.confidence > 0.4 && r.confidence <= 0.6).length,
        currentResults.filter(r => r.confidence > 0.6 && r.confidence <= 0.8).length,
        currentResults.filter(r => r.confidence > 0.8).length
    ];

    confidenceChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: ['0-20%','21-40%','41-60%','61-80%','81-100%'],
            datasets: [{ label:'Количество текстов', data: confidenceRanges, backgroundColor: '#667eea' }]
        }
    });
}

// === Вспомогательные функции ===
function showFileInfo(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.innerHTML = message;
    element.className = `status-message status-${type}`;
}

function showQuickResult(message, type) {
    const element = document.getElementById('quickAnalysisResult');
    element.innerHTML = message;
    element.className = `status-message status-${type}`;
}

// === Скачивание результатов ===
function downloadCsv() {
    if (currentResults.length === 0) { alert('Нет данных для скачивания'); return; }

    const headers = ['ID','label'];
    let csvContent = '\uFEFF' + headers.join(',') + '\n';

    currentResults.forEach((r, index) => {
        const row = [index+1, r.sentiment]; // ID = 1..N, label = 0/1/2
        csvContent += row.join(',') + '\n';
    });

    downloadFile(csvContent, 'submission.csv', 'text/csv;charset=utf-8');
}

function downloadJson() {
    if (currentResults.length === 0) { alert('Нет данных для скачивания'); return; }
    const jsonContent = JSON.stringify(currentResults, null, 2);
    downloadFile(jsonContent, 'analyzed_results.json', 'application/json;charset=utf-8');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
