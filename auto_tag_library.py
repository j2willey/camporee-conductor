import os
import json
import re

LIBRARY_DIR = 'public/library/games'
CATALOG_PATH = 'public/library/games/library-catalog.json'

TAG_RULES = {
    'fire': ['#firestart', '#outdoors'],
    'match': ['#firestart'],
    'burn': ['#firestart'],
    'knot': ['#knots'],
    'lash': ['#lashing', '#pioneering'],
    'pioneering': ['#pioneering'],
    'first aid': ['#firstaid', '#safety'],
    'bandage': ['#firstaid'],
    'carry': ['#firstaid', '#teamwork'],
    'compass': ['#navigation', '#orienteering'],
    'map': ['#navigation'],
    'agil': ['#agility', '#fitness'],
    'run': ['#agility', '#fitness'],
    'relay': ['#teamwork', '#relay'],
    'cook': ['#cooking'],
    'flag': ['#scouthistory', '#ceremony'],
    'code': ['#communication'],
    'signal': ['#communication'],
    'tent': ['#camping'],
    'camp': ['#camping'],
    'ax': ['#woodsman', '#safety'],
    'saw': ['#woodsman', '#safety'],
    'chop': ['#woodsman']
}

def generate_tags(text):
    text = text.lower()
    tags = set()
    for keyword, mapped_tags in TAG_RULES.items():
        if keyword in text:
            for t in mapped_tags:
                tags.add(t)
    return list(sorted(tags))

def process_library():
    print("Auto-tagging library games...")
    games_processed = 0
    catalog = []

    files = [f for f in os.listdir(LIBRARY_DIR) if f.endswith('.json') and f != 'catalog.json' and f != 'library-catalog.json']
    
    for filename in files:
        filepath = os.path.join(LIBRARY_DIR, filename)
        with open(filepath, 'r') as f:
            try:
                game = json.load(f)
            except json.JSONDecodeError:
                print(f"Skipping invalid JSON: {filename}")
                continue

        # Determine source text for tagging
        title = game.get('meta', {}).get('title', '')
        desc = game.get('meta', {}).get('description', '')
        content_title = game.get('content', {}).get('title', '')
        
        full_text = f"{title} {desc} {content_title}"
        current_tags = set(game.get('meta', {}).get('tags', []))
        
        # Generate new tags
        new_tags = generate_tags(full_text)
        
        # Merge (don't remove existing)
        for t in new_tags:
            current_tags.add(t)
            
        # Ensure #pioneering if lashings involved
        if '#lashing' in current_tags:
            current_tags.add('#pioneering')

        final_tags = list(sorted(current_tags))
        
        # Update Game Object
        if 'meta' not in game: game['meta'] = {}
        game['meta']['tags'] = final_tags
        
        # Also sync to content.tags for instances
        if 'content' not in game: game['content'] = {}
        game['content']['tags'] = final_tags

        # Save File
        with open(filepath, 'w') as f:
            json.dump(game, f, indent=2)
            
        # Add to Catalog List
        games_processed += 1
        catalog.append({
            'path': filename,
            'id': game.get('id'),
            'title': title or content_title,
            'tags': final_tags,
            'type': game.get('type', 'patrol')
        })
        print(f"Tagged {filename}: {final_tags}")

    # Regenerate Catalog
    with open(CATALOG_PATH, 'w') as f:
        json.dump(catalog, f, indent=2)

    print(f"\nDone! Processed {games_processed} games.")
    print(f"Catalog regenerated at {CATALOG_PATH}")

if __name__ == "__main__":
    process_library()
