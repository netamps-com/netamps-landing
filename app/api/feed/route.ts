import { NextResponse } from 'next/server';

async function fetchFeed(url: string, source: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const xml = await res.text();
    
    const items: {title: string, link: string, source: string}[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      
      if (titleMatch && linkMatch) {
        let cleanTitle = titleMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'");
          
        items.push({
          title: cleanTitle,
          link: linkMatch[1],
          source
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [bleeping, crowdstrike, aws, cisco, hackersNews] = await Promise.all([
      fetchFeed('https://www.bleepingcomputer.com/feed/', 'BleepingComputer'),
      fetchFeed('https://ir.crowdstrike.com/rss/events.xml', 'CrowdStrike'),
      fetchFeed('https://aws.amazon.com/security/security-bulletins/rss/feed/', 'AWS Security'),
      fetchFeed('https://sec.cloudapps.cisco.com/security/center/eventResponses_20.xml', 'Cisco Security'),
      fetchFeed('https://feeds.feedburner.com/TheHackersNews', 'TheHackersNews')
    ]);
    
    // Combine and shuffle the feeds so they interleave beautifully
    let combined = [...bleeping, ...crowdstrike, ...aws, ...cisco];
    combined = combined.sort(() => Math.random() - 0.5);
    
    return NextResponse.json({ main: combined, hackersNews });
  } catch (error) {
    return NextResponse.json({
      main: [{ title: "Cybersecurity News Feed Temporarily Unavailable", link: "#", source: "System" }],
      hackersNews: []
    }, { status: 500 });
  }
}
