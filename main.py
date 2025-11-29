from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

# CORS для Render + фронта
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # можно указать конкретный домен
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- МОДЕЛИ ЗАПРОСОВ / ОТВЕТОВ -----

class CommentRequest(BaseModel):
    comments: List[str]

class SentimentResponse(BaseModel):
    text: str
    comment: str
    sentiment_label: str
    sentiment_class: int   # 0–негатив, 1–нейтраль, 2–позитив
    score: float


# ----- ПРОСТАЯ МОДЕЛЬ ТОНАЛЬНОСТИ -----

def analyze_sentiment(text: str):
    text_lower = text.lower()

    positive = ["отличный", "прекрасный", "супер", "хороший", "рекомендую", "нравится", "люблю"]
    negative = ["плохой", "ужасный", "не нравится", "разочарован", "неудобный", "сложный", "отвратительный"]

    # по умолчанию — нейтральный
    sentiment_label = "нейтральная"
    sentiment_class = 0
    score = 0.5

    # позитив
    if any(w in text_lower for w in positive):
        sentiment_label = "положительная"
        sentiment_class = 1
        score = 0.9

    # негатив
    if any(w in text_lower for w in negative):
        sentiment_label = "негативная"
        sentiment_class = 2
        score = 0.9

    return sentiment_label, sentiment_class, score


# ----- API ЭНДПОИНТЫ -----

@app.post("/analyze", response_model=List[SentimentResponse])
def analyze_comments(request: CommentRequest):
    results = []

    for comment in request.comments:
        label, cls, score = analyze_sentiment(comment)
        results.append(SentimentResponse(
            text=comment,
            comment=comment,
            sentiment_label=label,
            sentiment_class=cls,
            score=score
        ))

    return results


@app.post("/analyze_text")
def analyze_text(request: dict):
    text = request.get("text", "")

    if not isinstance(text, str):
        return {"error": "text must be a string"}

    label, cls, score = analyze_sentiment(text)

    return {
        "text": text,
        "comment": text,
        "sentiment_label": label,
        "sentiment_class": cls,
        "score": score,
        "source": "backend"
    }


# локальный запуск (Render игнорирует)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
