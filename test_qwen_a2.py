import asyncio
import os
from openai import AsyncOpenAI

async def test_qwen_back_translation():
    qwen_base_url = "http://202.112.194.88:10300/v1" 
    qwen_api_key = "sk-WfSgOWmMxSgdN6Pyhe4kARHQVv0Ombetxi6Lm4ahOabJeL2o" # 填入你拿到的真实 api-key

    print(f"🔗 正在尝试连接 Qwen: {qwen_base_url}")
    
    qwen_client = AsyncOpenAI(
        api_key=qwen_api_key,
        base_url=qwen_base_url
    )

    target_lang = "英语"
    ds_generated_text = "During the Spring Festival, Chinese people give red envelopes (hongbao) to children, symbolizing good luck and warding off evil spirits."
    prompt = f"请将以下{target_lang}的文化概念阐释精确翻译回中文，保持字面和语义的客观对齐，不要润色：\n{ds_generated_text}"

    try:
        response = await qwen_client.chat.completions.create(
            model="Qwen3-235B-Instruct", # ✅ 填入精准的模型名称
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0
        )
        print("\n✅ Qwen 通信成功！")
        print(f"📤 回译中文: {response.choices[0].message.content}")
        
    except Exception as e:
        print(f"\n❌ Qwen 调用失败，报错信息: {e}")

if __name__ == "__main__":
    asyncio.run(test_qwen_back_translation())