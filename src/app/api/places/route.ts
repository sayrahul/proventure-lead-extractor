import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const location = searchParams.get('location');

  if (!query || !location) {
    return NextResponse.json({ error: 'Both Query and Location are required' }, { status: 400 });
  }

  const API_KEY = 'AIzaSyChCiBFbMtHMEhE_Cqa0lORUps3GkQhV0A';
  const textQuery = `${query} in ${location}`;
  
  try {
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
    
    let allPlaces: any[] = [];
    let pageToken = '';
    
    // We will fetch up to 3 pages (Google's max is usually 60 results for text search)
    for (let i = 0; i < 3; i++) {
      const bodyPayload: any = {
        textQuery: textQuery,
        pageSize: 20
      };
      
      if (pageToken) {
        bodyPayload.pageToken = pageToken;
      }
      
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,nextPageToken'
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await response.json();

      if (data.error) {
        console.error('Google API Error:', data.error);
        if (allPlaces.length === 0) {
          return NextResponse.json({ error: data.error.message || 'Google API Error' }, { status: 500 });
        }
        break; // If we already have some results, just return what we have
      }

      if (data.places) {
        allPlaces = allPlaces.concat(data.places);
      }
      
      if (data.nextPageToken) {
        pageToken = data.nextPageToken;
        // Wait a short amount of time before the next request (Google requires a slight delay for next page tokens)
        await new Promise(r => setTimeout(r, 2000));
      } else {
        break; // No more pages
      }
    }

    if (allPlaces.length === 0) {
      return NextResponse.json({ leads: [] });
    }

    const leads = allPlaces.map((place: any) => ({
      id: place.id,
      name: place.displayName?.text || 'N/A',
      phone: place.nationalPhoneNumber || 'No Number',
      website: place.websiteUri || 'No Website',
      address: place.formattedAddress || 'N/A',
    }));

    // Filter out duplicates just in case
    const uniqueLeads = Array.from(new Map(leads.map(lead => [lead.id, lead])).values());

    return NextResponse.json({ leads: uniqueLeads });

  } catch (error) {
    console.error('Error fetching places:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
