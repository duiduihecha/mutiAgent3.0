"""
Vlog 视频渲染器 — Python 实现
使用 Pillow 逐帧绘制文字，FFmpeg 编码 MP4
"""
import subprocess, json, sys, os, math
from pathlib import Path
from io import BytesIO

def render_vlog(script_json: str, output_path: str, tmp_dir: str = "/tmp") -> str:
    """主渲染函数"""
    script = json.loads(script_json) if isinstance(script_json, str) else script_json
    
    # Step 1: 生成 TTS 音频
    audio_files = _generate_tts(script, tmp_dir)
    
    # Step 2: 生成 ASS 字幕
    ass_path = os.path.join(tmp_dir, "vlog_subtitles.ass")
    _write_ass(script, ass_path)
    
    # Step 3: 用 FFmpeg 合成（纯色背景 + 音频）
    bg_colors = {
        'opening': '0xff2a4b', 'culture': '0x6c5ce7',
        'comparison': '0x00b894', 'practice': '0xfdcb6e', 'closing': '0x0984e3',
    }
    first_color = bg_colors.get(script['scenes'][0]['bg_type'], '0x6c5ce7')
    duration = script['total_duration_sec']
    
    # 构建 FFmpeg 命令
    cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', f'color=c={first_color}:s=1080x1920:r=30:d={duration}',
    ]
    
    # 合并所有音频为一个文件
    concat_audio = os.path.join(tmp_dir, 'vlog_concat.mp3')
    audio_list_path = os.path.join(tmp_dir, 'vlog_audio_list.txt')
    
    existing_audio = [af for af in audio_files if af and os.path.exists(af)]
    
    if existing_audio:
        # 构建 concat 列表
        with open(audio_list_path, 'w') as f:
            for af in existing_audio:
                f.write(f"file '{af}'\n")
        
        subprocess.run([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', audio_list_path, '-c', 'copy', concat_audio,
        ], capture_output=True, timeout=30)
        
        cmd += ['-i', concat_audio]
        cmd += ['-map', '0:v', '-map', '1:a']
        cmd += ['-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-shortest', output_path]
    else:
        cmd += ['-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-t', str(duration), output_path]
    
    print(f"[Vlog] FFmpeg: {' '.join(cmd[:5])}...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    
    if result.returncode != 0:
        print(f"[Vlog] FFmpeg FAILED:\n{result.stderr[-500:]}")
        # 降级：保存脚本 JSON
        json_path = output_path.replace('.mp4', '.json')
        with open(json_path, 'w') as f:
            json.dump(script, f, ensure_ascii=False)
        return json_path
    
    # 清理临时文件
    for af in audio_files:
        try:
            os.remove(af)
        except:
            pass
    
    return output_path


def _generate_tts(script: dict, tmp_dir: str) -> list:
    """生成各场景 TTS 音频"""
    voices = {
        '英语': 'en-US-JennyNeural', '日语': 'ja-JP-NanamiNeural',
        '韩语': 'ko-KR-SunHiNeural', '法语': 'fr-FR-DeniseNeural',
        '西班牙语': 'es-ES-ElviraNeural', '泰语': 'th-TH-PremwadeeNeural',
        '阿拉伯语': 'ar-SA-ZariyahNeural', '俄语': 'ru-RU-SvetlanaNeural',
    }
    voice = voices.get(script['native_language'], 'en-US-JennyNeural')
    audio_files = []
    
    for i, scene in enumerate(script['scenes']):
        if not scene.get('narration'):
            audio_files.append(None)
            continue
        
        af = os.path.join(tmp_dir, f'vlog_scene_{i}.mp3')
        # 使用 edge-tts
        try:
            subprocess.run([
                'edge-tts', '--voice', voice,
                '--text', scene['narration'],
                '--write-media', af,
            ], capture_output=True, timeout=30, check=True)
            audio_files.append(af)
        except Exception as e:
            print(f"[Vlog] TTS scene {i} failed: {e}")
            # 生成静音占位
            dur = scene.get('duration_sec', 3)
            subprocess.run([
                'ffmpeg', '-y', '-f', 'lavfi',
                '-i', f'anullsrc=r=24000:cl=mono',
                '-t', str(dur), '-q:a', '9', '-acodec', 'libmp3lame', af,
            ], capture_output=True, timeout=10)
            audio_files.append(af)
    
    return audio_files


def _write_ass(script: dict, path: str):
    """生成 ASS 字幕文件"""
    ass = """[Script Info]
Title: 中文学习日记 Vlog
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Narration,Arial,34,&H00FFFFFF,2,1,2,60,60,60,1
Style: Chinese,Arial,28,&H0000D4FF,2,1,2,60,60,120,1
Style: Hashtag,Arial,24,&H0040C0FF,1,1,2,60,60,160,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    t = 0.0
    for scene in script['scenes']:
        start = _fmt_time(t)
        end = _fmt_time(t + scene['duration_sec'])
        t += scene['duration_sec']
        
        if scene.get('narration'):
            text = scene['narration'].replace(',', '，').replace('\n', '\\N')
            ass += f"Dialogue: 0,{start},{end},Narration,,0,0,0,,{text}\n"
        if scene.get('chinese_sample'):
            text = scene['chinese_sample'].replace(',', '，').replace('\n', '\\N')
            ass += f"Dialogue: 0,{start},{end},Chinese,,0,0,0,,{text}\n"
    
    # 结尾标签
    total = script['total_duration_sec']
    hs = '  '.join(script.get('hashtags', ['#学中文']))
    ass += f"Dialogue: 0,{_fmt_time(max(0,total-4))},{_fmt_time(total)},Hashtag,,0,0,0,,{hs}\n"
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(ass)


def _fmt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


# ─── CLI 入口 ───
if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python vlog_renderer.py <script.json> <output.mp4>")
        sys.exit(1)
    
    with open(sys.argv[1], 'r') as f:
        script = json.load(f)
    
    result = render_vlog(script, sys.argv[2])
    print(f"DONE: {result}")
