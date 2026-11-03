from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.preprocessing.text import Tokenizer
from fastapi import FastAPI,HTTPException, Path
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel,Field  
from keras.models import load_model
import numpy as np
import string 
import pickle
import re
from pathlib import Path




"""1.we are going to make some constants like:
    A.Model path
    B.Tokrnizer Path
    C.Max Sequnce Lenght
    D.Emtion lables
    E.Emotion emojis
    """
    
    

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "Artifacts"
MODEL_PATH = ARTIFACTS_DIR / "BiGRU.keras"
TOKENIZER_PATH = ARTIFACTS_DIR / "tokenizer.pkl"
STATIC_DIR = BASE_DIR / "static"

# max_sequence
max_sequence_length=50
# emotion_labels
emotion_labels=['sadness', 'joy', 'love', 'anger', 'fear', 'surprise']

# Emotion  EMojis 
# 😁😢😊😡😘😶😲😱
Emotion_emojis={
    'sadness':"😢", 'joy':"😊", 'love':"😘", 'anger':"😡", 'fear':"😱", 'surprise':"😲"
}

"""2.Preprocess the upcoming text
  cleans raw text so it matches the format used while training.
  A.Convert the text to lower case
  B.remove punctutaions
  c.remove special character
  D. Remove spaces
    """
    
    
def preprocess_text(text: str)->str:
    text = text.lower()
    text = re.sub(r"'","",text)
    text = re.sub(r"[^a-z0-9\s]"," ", text)
    text = re.sub(r"\s+", " ",text).strip()
    return text





"""
3.Request and Response Schemas 
A.Text Input->input schema the text sent by user
B.Prediction Response -> Output schema the emotion to show
C.Health Response(server health check)
"""
class TextInput(BaseModel):
    text : str =Field(
        ...,
        min_length=1,
        max_length=2000,
        description=" the sentence to analyze",
        json_schema_extra={"Example":"I feel so happy and excited"}
    )



class PredictionResponse(BaseModel):
    text: str
    predicted_emotion: str
    confidence: float
    all_probabilities: dict

    
    
class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    
    
    
"""4.Model loading and lifespan management 
    Load the Model and tokenizer once the server startup
    """
    
     
dl_model={}  #{1.BiGRU ,2.TOkenizer} ->True,{} ->False

@asynccontextmanager
async def lifespan(app:FastAPI):
    print("Loading the model and tokenizer...")
    dl_model["BiGRU"]=load_model(MODEL_PATH)
    with open(TOKENIZER_PATH,'rb') as file:
        dl_model["tokenizer"]=pickle.load(file)
    print('Model are loaded successfully')
    
    
    yield #pause,model is loaded and server is runnning and at this point model is waiting for request
    
    dl_model.clear()
    
    
    
"""5.Mount the static files to the FastAPI app(connecting)
     A.Enable CORS(Cross-Origin Resource Sharing) to allow requestes from differnt origins
    """
app=FastAPI(
    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"]
    )
    
app.mount('/static',StaticFiles(directory=STATIC_DIR),name="static")



"""6.API Endpoints
A.Server UI at homepage('/')
B.Helath check ENdpoint('/health')
C.Predict Emotion ENdpoint('/predict')
"""


# A.Server UI at homepage('/')
@app.get('/',include_in_schema=False)
def server_ui():
    return FileResponse(f'{STATIC_DIR}/index.html')


# B.Helath check ENdpoint('/health')
# question why u haven't mention the include_in_schema ?
@app.get('/health',response_model=HealthResponse)
def health_check():
    return HealthResponse(status="server is running",model_loaded=bool(dl_model))


# C.Predict Emotion ENdpoint('/predict')
"""1.CLeans the INput Sentence   
    2.Convert the words into numeric using tokenizer
    3.Pad the sequence using to ensure uniform length
    4.Run prediction using the BiGRU model
    5.Return the top emotion and full probability breakdown"""
    

@app.post('/predict',response_model=PredictionResponse)
def predict_emotion(text_input:TextInput):
    BiGRU_model=dl_model.get("BiGRU")
    tokenizer_model=dl_model.get("tokenizer")
    if BiGRU_model is None or tokenizer_model is None:
          raise HTTPException(status_code=503,detail="Model is not loaded yet. Please Try Agian later.")
    cleaned_text=preprocess_text(text_input.text)
      
      
    tokenized_text=tokenizer_model.texts_to_sequences([cleaned_text])
    padded_sequence=pad_sequences(tokenized_text,maxlen=max_sequence_length,padding='post',truncating='post')
      
    probabilities =BiGRU_model.predict(padded_sequence)[0]
    top_emotion_index=int(np.argmax(probabilities))
    #   dictonary comprehension to get the emotion and its probability
    all_probabilities={
          label: float(prob) for prob, label in zip(probabilities, emotion_labels)
      }
    # print("Input:", text_input.text)
    # print("Cleaned:", cleaned_text)
    # print("Tokenized:", tokenized_text)
    # print("Probabilities:", probabilities)
    # print("Predicted index:", np.argmax(probabilities)) 
    # print(emotion_labels)
    # print(BiGRU_model.output_shape)
    return PredictionResponse(text=text_input.text,
                                predicted_emotion=emotion_labels[top_emotion_index],
                                confidence=float(probabilities[top_emotion_index]),
                                all_probabilities=all_probabilities
                                )
