import crypto from 'node:crypto';
import {getPool} from './pool.mjs';

const searchTerms = region => [
  `${region} 아이와 가볼만한곳`,
  `${region} 키즈카페`,
  `${region} 어린이 박물관`,
  `${region} 아이와 공원`,
  `${region} 가족 식당`
];

const plainText = value => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim();

const coordinate = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number / 10000000 : null;
};

async function searchNaver(query) {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error('naver_search_not_configured');
    error.code = 'naver_search_not_configured';
    throw error;
  }
  const url = new URL('https://openapi.naver.com/v1/search/local.json');
  url.search = new URLSearchParams({query, display: '5', start: '1', sort: 'comment'});
  const response = await fetch(url, {headers: {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret
  }});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.errorMessage || `naver_search_failed_${response.status}`);
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function refreshPlacesFromNaver(region) {
  const queries = searchTerms(region);
  const responses = await Promise.all(queries.map(searchNaver));
  const unique = new Map();
  responses.forEach((items, queryIndex) => items.forEach(item => {
    const name = plainText(item.title);
    const roadAddress = plainText(item.roadAddress);
    const jibunAddress = plainText(item.address);
    const latitude = coordinate(item.mapy);
    const longitude = coordinate(item.mapx);
    if (!name || latitude == null || longitude == null) return;
    const fingerprint = `${roadAddress || jibunAddress}|${name}`.toLowerCase();
    if (!unique.has(fingerprint)) unique.set(fingerprint, {item, name, roadAddress, jibunAddress, latitude, longitude, query: queries[queryIndex]});
  }));

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    for (const place of unique.values()) {
      const providerId = `local:${crypto.createHash('sha256').update(`${place.roadAddress || place.jibunAddress}|${place.name}`).digest('hex').slice(0, 48)}`;
      const metadata = JSON.stringify({source: 'naver_local_search', query: place.query, description: plainText(place.item.description), fetchedAt: new Date().toISOString()});
      await connection.query(`
        INSERT INTO places
          (id,naver_place_id,name,category,road_address,jibun_address,latitude,longitude,phone,website_url,metadata,is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,true)
        ON DUPLICATE KEY UPDATE
          name=VALUES(name),category=VALUES(category),road_address=VALUES(road_address),
          jibun_address=VALUES(jibun_address),latitude=VALUES(latitude),longitude=VALUES(longitude),
          phone=VALUES(phone),website_url=VALUES(website_url),metadata=VALUES(metadata),is_active=true
      `, [crypto.randomUUID(), providerId, place.name, plainText(place.item.category).slice(0, 80) || null,
        place.roadAddress || null, place.jibunAddress || null, place.latitude, place.longitude,
        plainText(place.item.telephone) || null, place.item.link || null, metadata]);
    }
    await connection.commit();
    return {found: unique.size};
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
