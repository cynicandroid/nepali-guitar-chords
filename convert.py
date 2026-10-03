import os
import re
import json
import glob
import zipfile
import xml.etree.ElementTree as ET

namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

CHORD_REGEX = re.compile(
    r'^[A-G][#b]?(?:m|min|maj|dim|aug|sus|add|m7|maj7|7|9|11|13|add9|sus2|sus4|2|4|5|6)*(?:/[A-G][#b]?)?$'
)

def is_chord_line(line):
    if not line.strip():
        return False
    words = line.split()
    chord_count = 0
    non_empty_words = 0
    for word in words:
        clean_word = word.strip('[]()r,[]xX1234567890-|:—')
        if not clean_word:
            continue
        non_empty_words += 1
        if CHORD_REGEX.match(clean_word):
            chord_count += 1
            
    if non_empty_words == 0:
        return False
    return (chord_count / non_empty_words) >= 0.7

def parse_docx(filepath):
    try:
        with zipfile.ZipFile(filepath) as docx:
            xml_content = docx.read('word/document.xml')
            root = ET.fromstring(xml_content)
            paragraphs = root.findall('.//w:p', namespaces)
            
            lines = []
            for p in paragraphs:
                text_runs = p.findall('.//w:t', namespaces)
                text = ''.join([node.text for node in text_runs if node.text is not None])
                lines.append(text)
                
            metadata = {'capo': 'None', 'genre': 'N/A', 'strumming': 'N/A'}
            body_start_idx = 0
            
            for i, line in enumerate(lines[:6]):
                clean = line.strip()
                if not clean:
                    continue
                
                capo_match = re.match(r'^Capo\s*:\s*(.*)$', clean, re.IGNORECASE)
                genre_match = re.match(r'^Genre\s*:\s*(.*)$', clean, re.IGNORECASE)
                strumming_match = re.match(r'^Strumming\s*:\s*(.*)$', clean, re.IGNORECASE)
                
                if capo_match:
                    metadata['capo'] = capo_match.group(1).strip()
                    body_start_idx = i + 1
                elif genre_match:
                    metadata['genre'] = genre_match.group(1).strip()
                    body_start_idx = i + 1
                elif strumming_match:
                    metadata['strumming'] = strumming_match.group(1).strip()
                    body_start_idx = i + 1
                else:
                    break
                    
            body_lines = lines[body_start_idx:]
            while body_lines and not body_lines[0].strip():
                body_lines.pop(0)
            while body_lines and not body_lines[-1].strip():
                body_lines.pop()
                
            return metadata, body_lines
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return None, []

def main():
    os.makedirs('songs', exist_ok=True)
    
    # Find all .docx files in Guitar Tabs/
    docx_files = sorted(glob.glob('Guitar Tabs/*.docx'))
    songs = []
    
    for filepath in docx_files:
        basename = os.path.basename(filepath)
        if basename.startswith('_'):
            continue  # Skip utility files
            
        title = basename[:-5].strip()
        metadata, body_lines = parse_docx(filepath)
        if metadata is None:
            continue
            
        # Clean title for filename (replace spaces with underscores and remove special characters)
        safe_title = re.sub(r'[^a-zA-Z0-9_\-]', '', title.replace(' ', '_'))
        filename = f"{safe_title}.md"
        
        songs.append({
            'title': title,
            'filename': filename,
            'metadata': metadata,
            'body_lines': body_lines,
            'filepath': filepath
        })
        
    print(f"Found and parsed {len(songs)} songs.")
    
    # Sort songs alphabetically by title
    songs.sort(key=lambda x: x['title'].lower())
    
    # Generate songs.json (without file-specific metadata to keep it small)
    json_songs = []
    for s in songs:
        lines_data = []
        for line in s['body_lines']:
            lines_data.append({
                'text': line,
                'is_chord': is_chord_line(line)
            })
        json_songs.append({
            'title': s['title'],
            'filename': s['filename'],
            'capo': s['metadata']['capo'],
            'genre': s['metadata']['genre'],
            'strumming': s['metadata']['strumming'],
            'lines': lines_data
        })
        
    with open('songs.json', 'w', encoding='utf-8') as f:
        json.dump(json_songs, f, indent=2, ensure_ascii=False)
    print("Generated songs.json")
    
    # Generate individual markdown files in songs/
    for i, s in enumerate(songs):
        prev_song = songs[i - 1] if i > 0 else songs[-1]
        next_song = songs[i + 1] if i < len(songs) - 1 else songs[0]
        
        md_content = []
        md_content.append(f"# {s['title']}\n")
        
        # Metadata
        md_content.append(f"**Capo:** {s['metadata']['capo']}  ")
        md_content.append(f"**Genre:** {s['metadata']['genre']}  ")
        md_content.append(f"**Strumming:** {s['metadata']['strumming']}  \n")
        md_content.append("---\n")
        
        # Navigation top
        md_content.append(f"[⏮️ Previous: {prev_song['title']}]({prev_song['filename']}) | [🏡 Song List](../README.md) | [⏭️ Next: {next_song['title']}]({next_song['filename']})\n")
        md_content.append("---\n")
        
        # Song text body (rendered inside markdown code block to preserve exact character spacing)
        md_content.append("```text")
        for line in s['body_lines']:
            md_content.append(line)
        md_content.append("```\n")
        
        md_content.append("---\n")
        # Navigation bottom
        md_content.append(f"[⏮️ Previous: {prev_song['title']}]({prev_song['filename']}) | [🏡 Song List](../README.md) | [⏭️ Next: {next_song['title']}]({next_song['filename']})\n")
        
        with open(os.path.join('songs', s['filename']), 'w', encoding='utf-8') as f:
            f.write('\n'.join(md_content))
            
    print(f"Generated {len(songs)} markdown files in songs/")
    
    # Generate main README.md
    readme_content = []
    readme_content.append("# 🎶 Nepali Guitar Chords & Tabs Collection 🎸\n")
    readme_content.append("Welcome to the **Nepali Guitar Chords & Tabs Collection**! This repository is an interactive, digital songbook containing chords and lyrics for over 200+ popular Nepali, Hindi, and English songs.\n")
    
    readme_content.append("## 🌟 Features\n")
    readme_content.append("- **Perfect Chord Alignment:** Every song is rendered using a monospaced layout to ensure that chord symbols remain perfectly aligned above the lyrics, matching the original formatting.")
    readme_content.append("- **Seamless Sequential Navigation:** Every song includes handy `⏮️ Previous` and `⏭️ Next` links, allowing you to flip through the songbook sequentially like a real binder.")
    readme_content.append("- **Instant Search & Transposition Web App:** Launch the companion static web app to search songs instantly, adjust font sizes, auto-scroll, and **transpose chords** on-the-fly to match your voice!\n")
    
    readme_content.append("## 🖥️ Interactive Web Companion (GitHub Pages)\n")
    readme_content.append("You can open `index.html` in any browser to launch the beautiful, responsive, mobile-friendly songbook web app. It is completely static and ready to be hosted on **GitHub Pages**!\n")
    readme_content.append("### Web App Highlights:\n")
    readme_content.append("- 🔍 **Instant Search:** Find any song by title in milliseconds.")
    readme_content.append("- 🎼 **Transposition:** Transpose the key of any song up or down with a single click (with column alignment preserved!).")
    readme_content.append("- 📜 **Auto-Scroll:** Play hands-free with adjustable scrolling speed.")
    readme_content.append("- 🌓 **Dark Mode:** Easy on the eyes for late-night campfire jam sessions.")
    readme_content.append("- 📏 **Font Adjuster:** Zoom in or out to fit your screen perfectly.\n")
    
    # Check if chord chart images exist in Guitar Tabs/
    readme_content.append("## 📊 Reference Charts\n")
    readme_content.append("Here are some useful visual references included in this project:\n")
    if os.path.exists('Guitar Tabs/_Guitar-chord-chart.png'):
        readme_content.append("- [🎸 Chord Reference Chart](Guitar%20Tabs/_Guitar-chord-chart.png)")
    if os.path.exists('Guitar Tabs/_Guitar Chords.jpg'):
        readme_content.append("- [🎼 Standard Chords Diagram](Guitar%20Tabs/_Guitar%20Chords.jpg)")
    if os.path.exists('Guitar Tabs/circle-of-fifths.webp'):
        readme_content.append("- [🔄 Circle of Fifths Diagram](Guitar%20Tabs/circle-of-fifths.webp)")
    readme_content.append("\n---\n")
    
    # Generate A-Z index header links
    letters = sorted(list(set([s['title'][0].upper() for s in songs if s['title'] and s['title'][0].isalpha()])))
    readme_content.append("## 🎵 Songs Directory\n")
    
    letter_links = " | ".join([f"[{let}](#{let.lower()})" for let in letters])
    readme_content.append(f"**Browse by letter:**  \n{letter_links}\n")
    
    current_letter = None
    for s in songs:
        first_char = s['title'][0].upper() if s['title'] else ''
        if not first_char.isalpha():
            first_char = '#'
            
        if first_char != current_letter:
            current_letter = first_char
            readme_content.append(f"\n### <a name='{current_letter.lower()}'></a>{current_letter}\n")
            
        capo_str = f" (Capo: {s['metadata']['capo']})" if s['metadata']['capo'] and s['metadata']['capo'].lower() != 'none' else ""
        readme_content.append(f"- [{s['title']}](songs/{s['filename']}){capo_str}")
        
    readme_content.append("\n---\n")
    readme_content.append("## 🛠️ Regenerating the Database\n")
    readme_content.append("If you add or update `.docx` files in the `Guitar Tabs/` directory, you can easily rebuild the markdown directory and JSON database by running:\n")
    readme_content.append("```bash\npython3 convert.py\n```\n")
    
    with open('README.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(readme_content))
    print("Generated README.md")

if __name__ == '__main__':
    main()