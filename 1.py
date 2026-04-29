import requests
import time
import json

# --- Configuration ---
# 1. Google Places API Key (New)
GOOGLE_API_KEY = 'AIzaSyChCiBFbMtHMEhE_Cqa0lORUps3GkQhV0A'

# 2. Google Apps Script Web App URL (Paste your deployed URL here)
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-jKRb58vwoCWuSUrdHOxhEkMjAEp5hbMxNGtmSevR442bs9f_opzK0ONTBnmjlFHy3Q/exec'

QUERY = 'dental clinics'
LOCATION = 'Pune'
TEXT_QUERY = f"{QUERY} in {LOCATION}"

def get_leads_and_push():
    print(f"Searching for '{TEXT_QUERY}' using New Google Places API...")
    
    search_url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating"
    }
    payload = {
        "textQuery": TEXT_QUERY
    }
    
    try:
        response = requests.post(search_url, json=payload, headers=headers).json()
    except Exception as e:
        print(f"Failed to connect to Google API: {e}")
        return
    
    if 'places' not in response or len(response['places']) == 0:
        print("No results found or invalid API Key.")
        if 'error' in response:
            print(f"API Error: {response['error']}")
        return
        
    print(f"Found {len(response['places'])} businesses. Pushing to Google Sheets database...\n")

    success_count = 0
    error_count = 0

    for place in response['places']:
        name = place.get('displayName', {}).get('text', 'N/A')
        phone = place.get('nationalPhoneNumber', 'No Number')
        website = place.get('websiteUri', 'No Website')
        address = place.get('formattedAddress', 'N/A')
        rating = place.get('rating', 'N/A')
        
        lead_payload = {
            'Business Name': name,
            'Phone': phone,
            'Website': website,
            'Address': address,
            'Rating': str(rating),
            'Query_Used': TEXT_QUERY
        }
        
        print(f"Pushing: {name}...", end=" ")
        
        # Send POST request to Google Apps Script
        try:
            gs_response = requests.post(APPS_SCRIPT_URL, json=lead_payload)
            if gs_response.status_code == 200:
                print("SUCCESS")
                success_count += 1
            else:
                print(f"FAILED (Status: {gs_response.status_code})")
                error_count += 1
        except Exception as e:
            print(f"FAILED (Error: {e})")
            error_count += 1
            
        # Small delay to prevent hitting Apps Script rate limits
        time.sleep(0.5)
        
    print(f"\nFinished! Successfully pushed {success_count} leads. Errors: {error_count}")

if __name__ == '__main__':
    if APPS_SCRIPT_URL == 'PASTE_YOUR_APPS_SCRIPT_URL_HERE':
        print("ERROR: Please paste your Google Apps Script URL in APPS_SCRIPT_URL before running!")
    else:
        get_leads_and_push()