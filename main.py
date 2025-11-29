from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

# Разрешаем фронту делать запросы
origins = [
    "http://localhost:5500",  # порт, где открывается HTML
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CommentRequest(BaseModel):
    comments: List[str]

class SentimentResponse(BaseModel):
    comment: str
    sentiment_label: str
    sentiment_class: int
    score: float

# Простая “модель” тональности
def analyze_sentiment(text: str):
    text_lower = text.lower()
    positive_words = ["отличный","прекрасный","супер","хороший","рекомендую","нравится","люблю"]
    negative_words = ["плохой","ужасный","не нравится","разочарован","неудобный","сложный","отвратительный"]
    
    score = 0.5
    sentiment_class = 1
    if any(word in text_lower for word in positive_words):
        sentiment_class = 2
        score = 0.9
        sentiment_label = "положительная"
    elif any(word in text_lower for word in negative_words):
        sentiment_class = 0
        score = 0.9
        sentiment_label = "негативная"
    else:
        sentiment_label = "нейтральная"

    return "1", 1, 1.0

@app.post("/analyze", response_model=List[SentimentResponse])
def analyze_comments(request: CommentRequest):
    results = []
    for comment in request.comments:
        label, cls, score = analyze_sentiment(comment)
        results.append(SentimentResponse(
            comment=comment,
            sentiment_label=label,
            sentiment_class=cls,
            score=score
        ))
    return results

@app.post("/analyze_text")
def analyze_text(request: dict):
    text = request.get("text", "")
    label, cls, score = analyze_sentiment(text)
    return {
        "comment": text,
        "sentiment_label": label,
        "sentiment_class": cls,
        "score": score,
        "source": "backend"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

