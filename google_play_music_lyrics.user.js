// ==UserScript==
// @name           Google Play Music Lyrics
// @namespace      https://plus.google.com/u/0/118049995301012161343/posts
// @author         Matheus Eichelberger
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js
// @include        http://play.google.com/music/listen*
// @include        https://play.google.com/music/listen*
// @include        http://music.google.com/music/listen*
// @include        https://music.google.com/music/listen*
// @match          http://play.google.com/music/listen*
// @match          https://play.google.com/music/listen*
// @match          http://music.google.com/music/listen*
// @match          https://music.google.com/music/listen*
// @run-at         document-start
// @description    Adds Lyrics fetching from multiple sources to Google Play Music
// @grant          GM_xmlhttpRequest
// ==/UserScript==

var DEBUG = false;

function capitalizeFirstLetterEachWord(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function removeNonRegularLetters(str) {
    return str.replace(/[^a-zA-Z]/g,'');
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function separateInVerses(lyrics) {
  var verses = lyrics.split("\n\n");
  
  var result = "";
  
  verses.forEach(function(verse) {
    result += '<div class="verse">';
    var lines = verse.split("\n");
    lines.forEach(function(line) {
      result += "<p>" + line.trim() + "</p>";
    });
    result += "</div>"
  });
  
  return result;
}

function GooglePlayMusicLyricsFetcherPlugin() {}

function GooglePlayMusicLyricsFetcher() {
  this.currentSong = "";
  this.currentArtist = "";
  this.currentAlbum = "";
  this.plugins = [];
  
  //Resizing stuff
  this.resizing = false;
  this.startX = 0.0;
  this.currentX = 0.0;
  this.mouseMoveEvent = null;  
  
  var thisFetcher = this;  
  
  this.mouseUpEvent = function() {
    if (DEBUG) console.log('Mouseup on resizer');
    thisFetcher.originalContainerSize = $('#gpml_lyrics_container').width(); 
    thisFetcher.currentX = 0.0;
    
    window.localStorage.setItem('[config]lyrics-pane-width', $('#gpml_lyrics_container').width());
    
    $('body').unbind('mouseup', thisFetcher.mouseUpEvent);
    $('body').unbind('mousemove', thisFetcher.mouseMoveEvent);
  };
  this.mouseMoveEvent = function(event) {
    if (DEBUG) console.log('Mousemove on resizer.');
    
    var totalDelta = thisFetcher.startX - event.pageX;
    if(!thisFetcher.resizing && Math.abs(totalDelta) >= 30) {
        thisFetcher.resizing = true;
        thisFetcher.currentX = thisFetcher.startX;
    }
    
    var currentDelta = Math.abs(thisFetcher.currentX - event.pageX);
    if (DEBUG) console.log('Delta => '+currentDelta+', X = '+event.pageX);
    if (thisFetcher.resizing && currentDelta >= 2) {    
      $('#gpml_lyrics_container').width(thisFetcher.originalContainerSize + totalDelta);
      $('#content-container').css('margin-right', thisFetcher.originalContainerSize + totalDelta);
      thisFetcher.currentX = event.pageX;
    }
  };
}

/**************
 * FETCHER
 **************/
GooglePlayMusicLyricsFetcher.prototype.addPlugin = function(plugin) {
  this.plugins.push(plugin);
}

GooglePlayMusicLyricsFetcher.prototype.saveLyrics = function(artist, album, song, lyrics) {
  window.localStorage.setItem(artist+"|"+album+"|"+song, lyrics);
}

GooglePlayMusicLyricsFetcher.prototype.usePlugin = function(pluginIndex, artist, album, song) {
  if (song != this.currentSong || artist != this.currentArtist) return; //track has changed
  var plugin = this.plugins[pluginIndex];
  if (plugin) {
	if (DEBUG) console.log('Using plugin '+(pluginIndex+1)+"/"+this.plugins.length);
    var url = plugin.getUrl(artist, album, song);   

    var thisFetcher = this;

    if (url) {
      GM_xmlhttpRequest({
        method: plugin.getMethod(),
        url: url,
        onload: function(response) {
          var data = response.responseText;
		  var lyrics = null;
          if (data) {            
            lyrics = plugin.parseLyrics(data, artist, album, song);
            if (lyrics) {
              thisFetcher.saveLyrics(artist, album, song, lyrics);
              $('#gpml_lyrics_content').html(lyrics);
              return;
            }
          }
		  if (!lyrics) {		  
            thisFetcher.usePlugin(pluginIndex + 1, artist, album, song);
		  }
        }
      });  
    }
  } else {
    $('#gpml_lyrics_content').html('<em>No lyrics found</em>');    
  }
}

GooglePlayMusicLyricsFetcher.prototype.fetchSong = function() {
  var song = $('div#playerSongTitle').html();
  var artist = $('div#player-artist').html();
  var album = $('div.player-artist-album-wrapper > div.player-album').html();
  
  if (song && artist && album) {
    if (this.currentSong != song || this.currentArtist != artist || this.currentAlbum != album) {
      this.currentSong = song;
      this.currentArtist = artist;
      this.currentAlbum = album;

      var offlineLyrics = window.localStorage.getItem(artist+"|"+album+"|"+song);
      if (offlineLyrics) {
        $('#gpml_lyrics_content').html(offlineLyrics);
      } else {
        $('#gpml_lyrics_content').html('<em>Searching for lyrics...</em>');

        this.usePlugin(0, artist, album, song);      
      }
    }
  }
  
  var self = this;
  
  setTimeout(function() {
    self.fetchSong();
  }, 500);
}

GooglePlayMusicLyricsFetcher.prototype.init = function() {
  var paneWidth = window.localStorage.getItem('[config]lyrics-pane-width'); 
  if (!paneWidth) {
    paneWidth = 300;
  }
  
  $('head').append(
    '<style>\n'+
        '#gpml_lyrics_container {float: right; background-color: #FFFFFF;}\n'+
        '#gpml_lyrics_resizer {float: left; width: 3px; cursor: ew-resize; background-color: #E5E5E5;}\n'+
        '#gpml_lyrics_header {padding: 14px 0 0 26px; color: #747474; font-size: 24px; font-weight: 300; text-transform: none; border-bottom: 1px solid #D8D7D9; cursor: default;}\n'+
        '#gpml_lyrics_content {padding: 15px; overflow-y:auto; user-select: text; -moz-user-select: text; -webkit-user-select: text; -ms-user-select: text;}\n'+
        '#gpml_lyrics_content .verse {margin-bottom: 12px;}\n'+
        '#gpml_lyrics_content .verse p {margin: 0;}\n'+
    '</style>'
  );

  $('#content-container').css('margin-right', paneWidth+'px');
  $('#content-container').before(
    '<div id="gpml_lyrics_container" style="width: '+paneWidth+'px;">'+    
      '<div id="gpml_lyrics_resizer">&nbsp;</div>'+
      '<div id="gpml_lyrics_header">Lyrics</div>'+
      '<div id="gpml_lyrics_content">'+
        '<em>No song currently playing</em>'+
      '</div>'+      
    '</div>');
  
  var thisFetcher = this;
  
  $('#gpml_lyrics_resizer').mousedown(function(event) {
    thisFetcher.startX = event.pageX;    
    thisFetcher.originalContainerSize = $('#gpml_lyrics_container').width();
  
    $('body').bind('mousemove', thisFetcher.mouseMoveEvent);
    $('body').bind('mouseup', thisFetcher.mouseUpEvent);
  });
    
  var mutationObserver = new MutationObserver(function(mutations) {
        $('#gpml_lyrics_resizer').height($('#content-container').height());
        $('#gpml_lyrics_container').height($('#content-container').height());
        $('#gpml_lyrics_content').height($('#content-container').height() - 80);
      });
  
  mutationObserver.observe(document.querySelector('#doc'), { attributes: true });
  
}

/**************
 * PLUGINS 
 **************/
 // Lyrics Wiki
function LyricsWikiPlugin() {}
LyricsWikiPlugin.prototype.getUrl = function(artist, album, song) {      
  song = capitalizeFirstLetterEachWord(song).replace(/ /g, '_').replace(/,/g, '');
  artist = capitalizeFirstLetterEachWord(artist).replace(/ /g, '_').replace(/,/g, ''); 
  var url = 'http://lyrics.wikia.com/'+artist+':'+song;
  if (DEBUG) console.log("URL [WIKI]: "+url);
  return url;  
}
LyricsWikiPlugin.prototype.getMethod = function() {
  return "GET";
}
LyricsWikiPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = $('.lyricbox', responseText);
  if (lyrics.length != 1) return null;
  
  $('div', lyrics).each(function() {$(this).remove()});
  $('p', lyrics).each(function() {$(this).remove()});
  $('span', lyrics).each(function() {$(this).remove()});
  lyrics = $(lyrics).html();  
  
  lyrics = lyrics.replace(/\n/g, "").replace(/<!--.*?-->/gm, "").trim().replace(/<br.*?>/g, "\n").trim().replace(/<.+?>.+?<\/.+?>/g, "");
  
  return separateInVerses(lyrics);
}

 // Terra
function TerraPlugin() {}
TerraPlugin.prototype.getUrl = function(artist, album, song) {      
  song = escape(song.replace(/,/g, ''));
  artist = escape(artist.replace(/,/g, ''));
  var url = "http://letras.mus.br/winamp.php?musica=" + song + "&artista=" + artist;
  if (DEBUG) console.log("URL [TERRA]: "+ url);
  return url; 
}
TerraPlugin.prototype.getMethod = function() {
  return "GET";
}
TerraPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = $('#letra > p', responseText);
  lyrics = $(lyrics).html();
  if (!lyrics) return;
  lyrics = lyrics.replace(/\n/g, "").replace(/<br.*?>/g, "\n").replace(/<.+?>.+?<\/.+?>/g, "");
  
  return separateInVerses(lyrics)
}

 // Dark Lyrics
function DarkLyricsPlugin() {}
DarkLyricsPlugin.prototype.getUrl = function(artist, album, song) {      
  album = removeNonRegularLetters(escape(album.replace(/,/g, '').replace(/ /g, '').toLowerCase()));
  artist = removeNonRegularLetters(escape(artist.replace(/,/g, '').replace(/ /g, '').toLowerCase()));
  var url = "http://www.darklyrics.com/lyrics/"+artist+"/"+album+".html";
  if (DEBUG) console.log("DARKURL -> " + url);
  return url; 
}
DarkLyricsPlugin.prototype.getMethod = function() {
  return "GET";
}
DarkLyricsPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = $('div.lyrics', responseText).html();
  if (!lyrics) return;
  var searchFor = song+"</a></h3><br>\n";
  var pieceStart = lyrics.indexOf(searchFor);
  if (pieceStart == -1) return null;
  var pieceEnd = lyrics.indexOf("<br>\n<h3>", pieceStart);
  if (pieceEnd == -1) {
	pieceEnd = lyrics.indexOf("<br>\n\n", pieceStart)
  }
  lyrics = lyrics.substring(pieceStart+searchFor.length, pieceEnd);
  lyrics = lyrics.replace(/\n/g, "").replace(/<br.*?>/g, "\n").replace(/<.+?>.+?<\/.+?>/g, "");
  
  return separateInVerses(lyrics);
}

// Az Lyrics
function AzLyricsPlugin() {}
AzLyricsPlugin.prototype.getUrl = function(artist, album, song) {      
  song = removeNonRegularLetters(escape(song.replace(/,/g, '').replace(/ /g, '').toLowerCase()));
  artist = removeNonRegularLetters(escape(artist.replace(/,/g, '').replace(/ /g, '').toLowerCase()));
  var url = "http://www.azlyrics.com/lyrics/"+artist+"/"+song+".html";
  if (DEBUG) console.log("AZ URL -> " + url);
  return url; 
}
AzLyricsPlugin.prototype.getMethod = function() {
  return "GET";
}
AzLyricsPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = responseText;
  
  var searchFor = "<!-- start of lyrics -->";
  var pieceStart = lyrics.indexOf(searchFor);
  if (pieceStart == -1) return null;
  var pieceEnd = lyrics.indexOf("<!-- end of lyrics -->", pieceStart);
  if (pieceEnd == -1) {
	return null;
  }
  lyrics = lyrics.substring(pieceStart+searchFor.length, pieceEnd);
  
  lyrics = lyrics.replace(/\n/g, "").replace(/<!--.*?-->/gm, "").replace(/<br.*?>/g, "\n").replace(/<.+?>.+?<\/.+?>/g, "").trim();
  
  return separateInVerses(lyrics);
}

// MetroLyrics
function MetroLyricsPlugin() {}
MetroLyricsPlugin.prototype.getUrl = function(artist, album, song) {      
  song = song.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9\-]/g, '').trim();
  artist = artist.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9\-]/g, '').trim();
  var url = "http://www.metrolyrics.com/"+song+"-lyrics-"+artist+".html";
  if (DEBUG) console.log("METRO URL -> " + url);
  return url; 
}
MetroLyricsPlugin.prototype.getMethod = function() {
  return "GET";
}
MetroLyricsPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var verses = $('div#lyrics-body > div.lyrics-body > p.verse', responseText);
  if (verses.length <= 0) return;
  var lyrics = "";
  $(verses).each(function(index, verse) {
    lyrics += (lyrics == "" ? "" : '<br /><br />') + $(verse).html();
  });
  lyrics = lyrics.replace(/\n/g, "").replace(/<!--.*?-->/gm, "").replace(/<br.*?>/g, "\n").replace(/<.+?>.+?<\/.+?>/g, "").trim();
  
  return separateInVerses(lyrics);
}

/**************
 * RUNTIME
 **************/
var fetcher = new GooglePlayMusicLyricsFetcher();
fetcher.addPlugin(new LyricsWikiPlugin());
fetcher.addPlugin(new TerraPlugin());
fetcher.addPlugin(new MetroLyricsPlugin());
fetcher.addPlugin(new DarkLyricsPlugin());
fetcher.addPlugin(new AzLyricsPlugin());

$(document).ready(function() {
  fetcher.init();
  fetcher.fetchSong();
});
