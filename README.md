# Home Chatbot

Casual home chatbot with a responsive React UI, FastAPI backend, SQLite conversation history, editable per-session system prompt, and streaming responses from `kakaocorp/kanana-1.5-8b-instruct-2505` loaded with 4-bit quantization by default.

## Build

```bash
docker build -t home-chatbot:0.1.0 .
```

## Run on GPU 1

```bash
docker run --rm \
  --gpus '"device=1"' \
  -p 8000:8000 \
  -v home-chatbot-data:/app/data \
  -v home-chatbot-hf:/app/hf_cache \
  -e HF_TOKEN=<your_huggingface_token_if_needed> \
  home-chatbot:0.1.0
```

Open `http://localhost:8000`.

## Notes

- Conversation sessions and messages are stored in `/app/data/chatbot.sqlite3`.
- Model cache is stored in `/app/hf_cache`.
- The app keeps a 20,000 token context budget through `MAX_CONTEXT_TOKENS`.
- `LOAD_IN_4BIT=true` uses bitsandbytes NF4 quantization for the Kanana 8B model.
- The container exposes a single port: `8000`.
- If the container is started with only GPU 1 visible, PyTorch will see it as `cuda:0`. If all GPUs are visible, `GPU_DEVICE=1` selects physical GPU 1.
