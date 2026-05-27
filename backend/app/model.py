import os
from threading import Thread
from typing import Iterable

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TextIteratorStreamer


MODEL_ID = os.getenv("MODEL_ID", "kakaocorp/kanana-1.5-8b-instruct-2505")
MAX_CONTEXT_TOKENS = int(os.getenv("MAX_CONTEXT_TOKENS", "20000"))
GPU_DEVICE = os.getenv("GPU_DEVICE", "1")
LOAD_IN_4BIT = os.getenv("LOAD_IN_4BIT", "true").lower() == "true"

_tokenizer = None
_model = None


def get_device() -> str:
    if not torch.cuda.is_available():
        return "cpu"
    try:
        index = int(GPU_DEVICE)
    except ValueError:
        index = 0
    if torch.cuda.device_count() > index:
        return f"cuda:{index}"
    return "cuda:0"


def load_model():
    global _tokenizer, _model
    if _tokenizer is not None and _model is not None:
        return _tokenizer, _model

    device = get_device()
    dtype = torch.float16 if device.startswith("cuda") else torch.float32
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model_kwargs = {
        "torch_dtype": dtype,
        "low_cpu_mem_usage": True,
    }
    if device.startswith("cuda") and LOAD_IN_4BIT:
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        model_kwargs["device_map"] = {"": device}
    _model = AutoModelForCausalLM.from_pretrained(MODEL_ID, **model_kwargs)
    if not (device.startswith("cuda") and LOAD_IN_4BIT):
        _model.to(device)
    _model.eval()
    return _tokenizer, _model


def build_chat_messages(system_prompt: str, history: list[dict], user_message: str) -> list[dict]:
    messages = [{"role": "system", "content": system_prompt}]
    for item in history:
        if item["role"] in {"user", "assistant"}:
            messages.append({"role": item["role"], "content": item["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages


def trim_to_context(tokenizer, messages: list[dict]) -> list[dict]:
    if len(messages) <= 2:
        return messages
    kept = [messages[0], *messages[1:]]
    while len(kept) > 2:
        token_count = len(tokenizer.apply_chat_template(kept, add_generation_prompt=True, tokenize=True))
        if token_count <= MAX_CONTEXT_TOKENS:
            return kept
        kept.pop(1)
    return kept


def stream_chat(system_prompt: str, history: list[dict], user_message: str, max_new_tokens: int, temperature: float, top_p: float) -> Iterable[str]:
    tokenizer, model = load_model()
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token_id = tokenizer.eos_token_id
    messages = trim_to_context(tokenizer, build_chat_messages(system_prompt, history, user_message))
    input_ids = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        return_tensors="pt",
        tokenize=True,
    ).to(model.device)
    attention_mask = torch.ones_like(input_ids, device=model.device)
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
    do_sample = temperature > 0
    kwargs = {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "streamer": streamer,
        "max_new_tokens": max_new_tokens,
        "repetition_penalty": 1.08,
        "do_sample": do_sample,
        "pad_token_id": tokenizer.eos_token_id,
    }
    if do_sample:
        kwargs["temperature"] = temperature
        kwargs["top_p"] = top_p
    thread = Thread(target=model.generate, kwargs=kwargs)
    thread.start()
    yield from streamer
    thread.join()
