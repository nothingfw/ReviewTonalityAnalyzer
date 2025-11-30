from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import re
import torch
import torch.nn as nn
import json

# ======================================
# FastAPI
# ======================================
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ======================================
# Модели данных
# ======================================
class CommentRequest(BaseModel):
    comments: List[str]

# ======================================
# Нормализация текста
# ======================================
def normalize_text(text: str) -> str:
    text = text.lower()
    text = text.replace('\n', ' ').replace('\t', ' ')
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'ё', 'е', text)
    text = re.sub(r'([!?…]){2,}', r'\1', text)
    text = re.sub(r'<.*?>', '', text)
    return text.strip()

# ======================================
# Разбиение на сегменты
# ======================================
def split_comments(text: str, min_len=30, max_len=300) -> List[str]:
    text = normalize_text(text)
    sentences = re.split(r'(?<=[.!?…])\s+', text)
    result = []
    buffer = ""
    for sent in sentences:
        sent = sent.strip()
        if len(sent) == 0: continue
        candidate = (buffer + " " + sent).strip() if buffer else sent
        if len(candidate) < min_len:
            buffer = candidate
            continue
        elif len(candidate) > max_len:
            parts = re.split(r'[,;]', candidate)
            for p in parts:
                p = p.strip()
                if len(p) > 0: result.append(p)
            buffer = ""
        else:
            result.append(candidate)
            buffer = ""
    if buffer:
        result.append(buffer)
    return result

# ======================================
# Токенайзер
# ======================================
class SimpleTokenizer:
    def __init__(self, vocab):
        self.word2id = vocab
        self.PAD = "[PAD]"
        self.UNK = "[UNK]"

    def encode(self, text, max_len=150):
        tokens = text.split()
        ids = [self.word2id.get(t, self.word2id[self.UNK]) for t in tokens]
        if len(ids) < max_len:
            ids += [self.word2id[self.PAD]] * (max_len - len(ids))
        else:
            ids = ids[:max_len]
        return ids

with open("models/tokenizer.json", "r", encoding="utf-8") as f:
    vocab = json.load(f)
tokenizer = SimpleTokenizer(vocab)

# ======================================
# Модель
# ======================================
class SimpleSentimentModel(nn.Module):
    def __init__(self, vocab_size, embed_dim=128, hidden_dim=256, num_labels=3):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.lstm = nn.LSTM(embed_dim, hidden_dim, batch_first=True)
        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(hidden_dim, num_labels)

    def forward(self, x):
        x = self.embedding(x)
        _, (h, _) = self.lstm(x)
        h = self.dropout(h[-1])
        return self.fc(h)

MODEL_PATH = "models/simple_model.pth"
DEVICE = "cpu"
model = SimpleSentimentModel(vocab_size=len(vocab)).to(DEVICE)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.eval()

LABEL_MAP = {0: "нейтральная", 1: "положительная", 2: "негативная"}
BATCH_SIZE = 256

# ======================================
# Анализ батчем
# ======================================
def analyze_sentiments_batch(texts: List[str]):
    all_ids = []
    all_segments = []

    for idx, text in enumerate(texts):
        segments = split_comments(text)
        for seg in segments:
            all_segments.append(seg)
            all_ids.append(idx)

    results = []
    for i in range(0, len(all_segments), BATCH_SIZE):
        batch = all_segments[i:i+BATCH_SIZE]
        batch_x = [tokenizer.encode(normalize_text(t)) for t in batch]
        x_tensor = torch.tensor(batch_x, dtype=torch.long).to(DEVICE)
        with torch.no_grad():
            logits = model(x_tensor)
            probs = torch.softmax(logits, dim=1)
            cls = torch.argmax(probs, dim=1).cpu().numpy()
            scores = probs.cpu().numpy()

        for j, seg_text in enumerate(batch):
            results.append({
                "id": all_ids[i+j],
                "text": texts[all_ids[i+j]],
                "comment": seg_text,
                "sentiment_label": LABEL_MAP[int(cls[j])],
                "sentiment_class": int(cls[j]),
                "score": float(scores[j][cls[j]]),
                "src": "simple_model"
            })
    return results

# ======================================
# API
# ======================================
@app.post("/analyze")
def analyze_comments(request: CommentRequest):
    return analyze_sentiments_batch(request.comments)

@app.post("/analyze_text")
def analyze_text(request: dict):
    text = request.get("text", "")
    if not isinstance(text, str):
        return {"error": "text must be string"}
    return analyze_sentiments_batch([text])[0]

@app.post("/analyze_text_batch")
def analyze_text_batch(request: dict):
    comments = request.get("comments", [])
    return analyze_sentiments_batch(comments)

# ======================================
# Macro-F1 без scikit-learn
# ======================================
@app.post("/macro_f1")
def macro_f1_endpoint(request: dict):
    y_true = request.get("y_true", [])
    y_pred = request.get("y_pred", [])

    if len(y_true) != len(y_pred):
        return {"error": "Length mismatch"}

    labels = set(y_true) | set(y_pred)
    f1_sum = 0
    for l in labels:
        tp = sum(yt==l and yp==l for yt, yp in zip(y_true, y_pred))
        fp = sum(yt!=l and yp==l for yt, yp in zip(y_true, y_pred))
        fn = sum(yt==l and yp!=l for yt, yp in zip(y_true, y_pred))
        precision = tp / (tp + fp + 1e-8)
        recall = tp / (tp + fn + 1e-8)
        f1_sum += 2*precision*recall/(precision+recall+1e-8)
    macro_f1_value = f1_sum / len(labels)
    return {"f1": macro_f1_value}

# ======================================
# Запуск
# ======================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
