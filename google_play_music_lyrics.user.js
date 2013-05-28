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

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
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
  var song = $('div#playerSongTitle > div.fade-out-content').html();
  var artist = $('div#player-artist').html();
  var album = $('div#playerSongInfo > div > div > div.player-album').html();
  
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

  $('#content-container').css('margin-right', paneWidth+'px');
  $('#content-container').before(
    '<div id="gpml_lyrics_container" style="float: right; width: '+paneWidth+'px; background-color: #FFFFFF;">'+    
      '<div id="gpml_lyrics_resizer" style="float: left; width: 3px; cursor: ew-resize; background-color: #E5E5E5;">&nbsp;</div>'+
      '<div id="gpml_lyrics_header" style="padding: 14px 0 0 26px; color: #747474; font-size: 24px; font-weight: 300; text-transform: none; border-bottom: 1px solid #D8D7D9; cursor: default;">Lyrics</div>'+
      '<div id="gpml_lyrics_content" style="padding: 15px; overflow-y:auto; user-select: text; -moz-user-select: text; -webkit-user-select: text; -ms-user-select: text;">'+
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
  
  mutationObserver.observe(document.querySelector('#content-container'), { attributes: true });
  
}

/**************
 * PLUGINS 
 **************/
 // Lyrics Wiki
function LyricsWikiPlugin() {}
LyricsWikiPlugin.prototype.getUrl = function(artist, album, song) {      
  song = capitalizeFirstLetterEachWord(song).replace(/ /g, '_').replace(/,/g, '');
  artist = capitalizeFirstLetterEachWord(artist).replace(/ /g, '_').replace(/,/g, ''); 
  if (DEBUG) console.log("URL [WIKI]: "+'http://lyrics.wikia.com/'+artist+':'+song);
  return 'http://lyrics.wikia.com/'+artist+':'+song;  
}
LyricsWikiPlugin.prototype.getMethod = function() {
  return "GET";
}
LyricsWikiPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = $('.lyricbox', responseText);
  $('div', lyrics).each(function() {$(this).remove()});
  $('span', lyrics).each(function() {$(this).remove()});
  lyrics = $(lyrics).html();
  return lyrics;
}

 // Terra
function TerraPlugin() {}
TerraPlugin.prototype.getUrl = function(artist, album, song) {      
  song = escape(song.replace(/,/g, ''));
  artist = escape(artist.replace(/,/g, '')); 
  if (DEBUG) console.log("URL [TERRA]: "+"http://letras.mus.br/winamp.php?musica=" + song + "&artista=" + artist);
  return "http://letras.mus.br/winamp.php?musica=" + song + "&artista=" + artist; 
}
TerraPlugin.prototype.getMethod = function() {
  return "GET";
}
TerraPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = $('#letra > p', responseText);
  lyrics = $(lyrics).html();
  return lyrics;
}

 // Dark Lyrics
function DarkLyricsPlugin() {}
DarkLyricsPlugin.prototype.getUrl = function(artist, album, song) {      
  album = escape(album.replace(/,/g, '').replace(/ /g, '').toLowerCase());
  artist = escape(artist.replace(/,/g, '').replace(/ /g, '').toLowerCase());
  if (DEBUG) console.log("DARKURL -> http://www.darklyrics.com/lyrics/"+artist+"/"+album+".html");
  return "http://www.darklyrics.com/lyrics/"+artist+"/"+album+".html"; 
}
DarkLyricsPlugin.prototype.getMethod = function() {
  return "GET";
}
DarkLyricsPlugin.prototype.parseLyrics = function(responseText, artist, album, song) {
  var lyrics = $('div.lyrics', responseText).html();
  var searchFor = song+"</a></h3><br>\n";
  var pieceStart = lyrics.indexOf(searchFor);
  if (pieceStart == -1) return null;
  var pieceEnd = lyrics.indexOf("<br>\n<h3>", pieceStart);
  if (pieceEnd == -1) {
	pieceEnd = lyrics.indexOf("<br>\n\n", pieceStart)
  }
  return lyrics.substring(pieceStart+searchFor.length, pieceEnd);
}

/**************
 * RUNTIME
 **************/
var fetcher = new GooglePlayMusicLyricsFetcher();
fetcher.addPlugin(new LyricsWikiPlugin());
fetcher.addPlugin(new TerraPlugin());
fetcher.addPlugin(new DarkLyricsPlugin());

$(document).ready(function() {
  fetcher.init();
  fetcher.fetchSong();
});