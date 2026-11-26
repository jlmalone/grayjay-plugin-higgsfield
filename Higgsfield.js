const projectPattern = /^https:\/\/higgsfield\.ai\/@([a-z0-9_.-]+)\/projects\/([a-z0-9_-]+)$/i;
const catalogURL = "https://fnf-api-gw.higgsfield.ai/fnf/contest-participations/publications?contest_key=talent_contest&tab=submissions&size=20";
const projectsURL = "https://fnf-api-gw.higgsfield.ai/fnf/project-publications/trending?limit=20";
const cdn = "https://cdn.higgsfield.ai/";

source.enable = function () {};
source.isContentDetailsUrl = function (url) { return projectPattern.test(url); };
source.getHome = function () { return browse("contest", "", null); };
source.search = function (query, collection) { return browse(collection, query, null); };

function browse(collection, query, cursor) {
    const catalog = collection === "projects" ? projectsURL : catalogURL;
    const search = query ? "&query=" + encodeURIComponent(query.trim().slice(0, 100)) : "";
    const response = http.GET(catalog + search + (cursor === null ? "" : "&cursor=" + encodeURIComponent(cursor)), {}, false);
    if (!response.isOk) throw new ScriptException("Higgsfield videos could not load. Try again.");
    const page = JSON.parse(response.body);
    if (!Array.isArray(page.items) || page.items.length > 20) throw new ScriptException("Higgsfield returned an invalid submissions page.");
    const videos = [];
    for (const item of page.items) {
        const author = item.authors?.find(person => person.username);
        const video = item.gallery_media?.find(media => media.type === "video" && typeof media.url === "string" && media.url.startsWith(cdn));
        const url = `https://higgsfield.ai/@${author?.username}/projects/${item.slug}`;
        if (item.state !== "published" || !author || !item.slug || !projectPattern.test(url) || !video) continue;
        const thumbnail = typeof video.thumbnail_url === "string" && video.thumbnail_url.startsWith(cdn) ? video.thumbnail_url : null;
        videos.push(new PlatformVideo({id: new PlatformID("Higgsfield", url, pluginID),
            name: String(item.name || "Untitled film").slice(0, 200), url,
            duration: Math.floor(item.duration_seconds || video.duration || 0),
            author: new PlatformAuthorLink(new PlatformID("Higgsfield", author.username, pluginID),
                "@" + author.username, "https://higgsfield.ai/@" + author.username),
            thumbnails: new Thumbnails(thumbnail ? [new Thumbnail(thumbnail, 0)] : [])}));
    }
    const next = page.next_cursor;
    const hasMore = typeof next === "string" && next.length > 0 && next.length <= 4096 && next !== cursor;
    const pager = new VideoPager(videos, hasMore);
    if (hasMore) pager.nextPage = () => browse(collection, query, next);
    return pager;
}

source.getContentDetails = function (url) {
    const project = projectPattern.exec(url);
    if (!project) throw new ScriptException("Open a public Higgsfield project link.");
    const page = http.GET(url, {}, false);
    if (!page.isOk) throw new ScriptException("Higgsfield could not open this public project.");
    // The project's primary video precedes its other media and project assets.
    const video = /\bvideo:(?:\$R\[\d+\]=)?\{src:"(https:\/\/cdn\.higgsfield\.ai\/hls\/[a-z0-9_/-]+\/index\.m3u8(?:\?v=[a-z0-9-]+)?)"/i.exec(page.body);
    if (!video) throw new ScriptException("This project does not expose a supported public video.");
    const title = /<title>([^<]{1,200}) \| Higgsfield Community<\/title>/i.exec(page.body);
    const summary = /<meta name="description" content="([^"]{1,8192})"/i.exec(page.body);
    const streams = [new HLSSource({name: "HLS", url: video[1], duration: 0})];
    // Match the watermark rendition used by the contest's explicit download_url.
    const rendition = /^(https:\/\/cdn\.higgsfield\.ai\/hls\/video_input_watermarked\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/)index\.m3u8(?:\?v=([a-f0-9-]{36}))?$/i.exec(video[1]);
    if (rendition && (!rendition[4] || rendition[4] === rendition[3])) {
        streams.push(new VideoUrlSource({name: "MP4", url: `${rendition[1]}download.mp4?v=${rendition[3]}&download=${rendition[2]}.mp4`,
            container: "video/mp4", codec: "avc1", duration: 0, width: 0, height: 0}));
    }
    return new PlatformVideoDetails({
        id: new PlatformID("Higgsfield", url, pluginID),
        name: title ? title[1] : project[2],
        url,
        description: summary ? summary[1].replace(/&#x27;|&#39;|&quot;|&lt;|&gt;|&amp;/g, entity => ({
            "&#x27;": "'", "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&amp;": "&"
        })[entity]) : null,
        author: new PlatformAuthorLink(new PlatformID("Higgsfield", project[1], pluginID),
            "@" + project[1], "https://higgsfield.ai/@" + project[1]),
        video: new VideoSourceDescriptor(streams)
    });
};
// SPDX-License-Identifier: AGPL-3.0-only
const pluginID = "b8af0ea6-6c3a-44c1-9c70-3395d856e2a5";
