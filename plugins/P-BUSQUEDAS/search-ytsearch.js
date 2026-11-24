import axios from 'axios'
import ytSearch from 'yt-search'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ CONFIGURACIÓN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_URL = 'https://api.delirius.online/search/ytsearch'
const MAX_RESULTS = 10
const API_TIMEOUT = 15000

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ REACCIONES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function react(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    })
  } catch {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ FORMATEAR VISTAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatViews(value) {
  if (value == null || value === '') return 'No disponible'

  const number = Number(value)

  return Number.isFinite(number)
    ? number.toLocaleString('es-PE')
    : String(value)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ NORMALIZAR RESULTADOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeVideo(item) {
  if (!item || typeof item !== 'object') return null

  const videoId = String(item.videoId || '').trim()
  const title = String(item.title || '').trim()
  const url = String(item.url || '').trim()
  const image = String(item.image || item.thumbnail || '').trim()

  const channel = String(
    item.author?.name ||
    item.description ||
    'No disponible'
  ).trim()

  const duration = String(
    item.duration || 'No disponible'
  ).trim()

  const publishedAt = String(
    item.publishedAt || 'No disponible'
  ).trim()

  if (!videoId || !title || !image) return null

  if (!/^https?:\/\//i.test(image)) return null

  return {
    videoId,
    title,
    url: url || `https://youtu.be/${videoId}`,
    image,
    channel,
    duration,
    views: formatViews(item.views),
    publishedAt
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ BUSCAR EN DELIRIUS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function searchYouTube(query) {
  // PRIMER INTENTO: API PRINCIPAL
  try {
    const { data } = await axios.get(API_URL, {
      params: { q: query },
      timeout: API_TIMEOUT,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SaitamaBot/9.0'
      }
    })

    if (data?.status === true && Array.isArray(data.data)) {
      const results = data.data
        .filter(item => item?.type === 'video')
        .map(normalizeVideo)
        .filter(Boolean)

      if (results.length) {
        console.log('[YTSEARCH] Búsqueda principal: OK')
        return results.slice(0, MAX_RESULTS)
      }
    }

    throw new Error('Resultados principales inválidos')
  } catch (error) {
    console.log(
      '[YTSEARCH] Búsqueda principal no disponible:',
      error?.message || error
    )
    console.log('[YTSEARCH] Activando respaldo...')
  }

  // SEGUNDO INTENTO: YT-SEARCH
  try {
    console.log('[YTSEARCH] Iniciando búsqueda de respaldo...')

    let timeoutId

    const response = await Promise.race([
      ytSearch(query),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Tiempo agotado en yt-search')),
          20000
        )
      })
    ]).finally(() => clearTimeout(timeoutId))

    console.log('[YTSEARCH] Respaldo respondió correctamente')

    const videos = response?.videos || []

    const results = videos
      .slice(0, MAX_RESULTS)
      .map(video => normalizeVideo({
        videoId: video.videoId,
        title: video.title,
        url: video.url,
        image: video.thumbnail || video.image,
        author: {
          name: video.author?.name || 'No disponible'
        },
        duration: video.timestamp || video.duration || 'No disponible',
        views: video.views,
        publishedAt: video.ago || 'No disponible'
      }))
      .filter(Boolean)

    if (!results.length) {
      throw new Error('El buscador de respaldo no encontró videos válidos')
    }

    console.log(
      '[YTSEARCH] Búsqueda de respaldo: OK. Resultados:',
      results.length
    )

    return results
  } catch (error) {
    console.error(
      '[YTSEARCH] Fallaron ambos buscadores:',
      error?.message || error
    )

    throw new Error('No se pudieron encontrar videos. Inténtalo nuevamente.')
  }
}

// ✰ CREAR TARJETAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createCards(results) {
  return results.map((video, index) => ({
    image: {
      url: video.image
    },

    title: `#${index + 1}`,

    caption:
      `*${video.title}*\n\n` +
      `Canal: ${video.channel}\n` +
      `Duración: ${video.duration}\n` +
      `Vistas: ${video.views}\n` +
      `Publicado: ${video.publishedAt}`,

    footer: 'SaitamaBot',

    nativeFlow: [
      {
        text: 'MP3',
        copy: `.ytmp3 ${video.videoId}`
      },
      {
        text: 'MP4',
        copy: `.ytmp4 ${video.videoId}`
      }
    ]
  }))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let handler = async (m, {
  conn,
  text,
  usedPrefix,
  command
}) => {

  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text:
        `✰ *𝚈𝙾𝚄𝚃𝚄𝙱𝙴 𝚂𝙴𝙰𝚁𝙲𝙷*\n\n` +
        `• Escribe lo que deseas buscar.\n` +
        `• Ejemplo: ${usedPrefix + command} Twice\n\n` +
        `SaitamaBot`
    }, {
      quoted: m
    })
  }

  const query = text.trim()

  console.log(`[YTSEARCH] Buscando: ${query}`)

  await react(conn, m, '🔎')

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✰ CONSULTAR API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let results

  try {
    results = await searchYouTube(query)

    console.log(
      `[YTSEARCH] Resultados válidos: ${results.length}`
    )
  } catch (error) {
    console.error(
      '[YTSEARCH] Delirius:',
      error?.stack || error
    )

    await react(conn, m, '❌')

    return conn.sendMessage(m.chat, {
      text:
        `༺ ✰ 𝙴𝚁𝚁𝙾𝚁 𝚈𝚃𝚂𝙴𝙰𝚁𝙲𝙷 ✰ ༻\n\n` +
        `• No se pudo realizar la búsqueda.\n` +
        `• Motivo: ${error.message}\n\n` +
        `SaitamaBot`
    }, {
      quoted: m
    })
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✰ PREPARAR TARJETAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const cards = createCards(results).slice(0, 5)

  console.log(
    `[YTSEARCH] Tarjetas preparadas: ${cards.length}`
  )

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✰ ENVIAR CARRUSEL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  try {
    console.log(
      `[YTSEARCH] Enviando carrusel: ${cards.length}`
    )

    const sent = await conn.sendMessage(m.chat, {
      text:
        `༺═────── ✰ ──────═༻\n` +
        `     *𝚈𝙾𝚄𝚃𝚄𝙱𝙴 𝚂𝙴𝙰𝚁𝙲𝙷*\n` +
        `༺═────── ✰ ──────═༻\n\n` +
        `✰ Búsqueda: ${query}\n` +
        `✰ Resultados: ${cards.length}\n\n` +
        `> Selecciona tu video y copia el comando de descarga.\n\n` +
        `*༺═────── SaitamaBot ──────═༻*`,
      footer: '𝑺𝒂𝒊𝒕𝒂𝒎𝒂𝑩𝒐𝒕',
      cards
    }, {
      quoted: m
    })

    console.log(
      '[YTSEARCH] Envío completado. ID:',
      sent?.key?.id || 'No disponible'
    )

    await react(conn, m, '✅')

  } catch (error) {
    console.error(
      '[YTSEARCH] Carrusel:',
      error?.stack || error
    )

    await react(conn, m, '❌')

    await conn.sendMessage(m.chat, {
      text:
        `༺ ✰ 𝙴𝚁𝚁𝙾𝚁 𝙲𝙰𝚁𝚁𝚄𝚂𝙴𝙻 ✰ ༻\n\n` +
        `• No se pudo enviar el carrusel.\n` +
        `• Motivo: ${error.message}\n\n` +
        `SaitamaBot`
    }, {
      quoted: m
    })
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ COMANDOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

handler.help = ['ytsearch <texto>']
handler.tags = ['busqueda']
handler.command = ['ytsearch', 'buscaryt']
handler.register = false

export default handler
