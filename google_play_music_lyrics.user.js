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

function capitalizeFirstLetterEachWord(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function GooglePlayMusicLyricsFetcherPlugin() {}

function GooglePlayMusicLyricsFetcher() {
  this.currentSong = "";
  this.currentArtist = "";
  this.plugins = [];
}

/**************
 * FETCHER
 **************/
GooglePlayMusicLyricsFetcher.prototype.addPlugin = function(plugin) {
  this.plugins.push(plugin);
}

GooglePlayMusicLyricsFetcher.prototype.saveLyrics = function(song, artist, lyrics) {
  window.localStorage.setItem(artist+"|"+song, lyrics);
}

GooglePlayMusicLyricsFetcher.prototype.usePlugin = function(pluginIndex, song, artist) {
  if (song != this.currentSong || artist != this.currentArtist) return; //track has changed
  var plugin = this.plugins[pluginIndex];
  if (plugin) {
    var url = plugin.getUrl(song, artist);   

    var thisFetcher = this;

    if (url) {
      GM_xmlhttpRequest({
        method: plugin.getMethod(),
        url: url,
        onload: function(response) {
          var data = response.responseText;
          if (data) {            
            var lyrics = plugin.parseLyrics(data);
            if (lyrics) {
              thisFetcher.saveLyrics(song, artist, lyrics);
              $('#gpml_lyrics_content').html(lyrics);
              return;
            }
          }
          thisFetcher.usePlugin(pluginIndex + 1, song, artist);
        }
      });  
    }
  } else {
    $('#gpml_lyrics_content').html('<em>No lyrics found</em>');    
  }
}

GooglePlayMusicLyricsFetcher.prototype.fetchSong = function() {
  var song = $('div#playerSongTitle > div.fade-out-content').html();
  var artist = $('div#player-artist > div.fade-out-content').html();
  if (song && artist) {
    if (this.currentSong != song || this.currentArtist != artist) {
      this.currentSong = song;
      this.currentArtist = artist;

      var offlineLyrics = window.localStorage.getItem(artist+"|"+song);
      if (offlineLyrics) {
        $('#gpml_lyrics_content').html(offlineLyrics);
      } else {
        $('#gpml_lyrics_content').html('<em>Sarching for lyrics...</em>');

        this.usePlugin(0, song, artist);      
      }
    }
  }
  
  var self = this;
  
  setTimeout(function() {
    self.fetchSong();
  }, 500);
}

GooglePlayMusicLyricsFetcher.prototype.init = function() { 
  $('#content-container').css('margin-right', '300px');
  $('#content-container').before(
    '<div id="gpml_lyrics_container" style="float: right; width: 295px; margin-left: 5px; background-color: #ffffff;">'+
      '<div id="gpml_lyrics_header" style="padding: 19px 0 0 20px; font-size: 15px; border-bottom: 1px solid #D8D7D9; color: #ED8335; font-weight: 700;">LYRICS</div>'+
      '<div id="gpml_lyrics_content" style="padding: 15px; overflow-y:auto;">'+
        '<em>No song currently playing</em>'+
      '</div>'+      
    '</div>');
    
  var mutationObserver = new MutationObserver(function(mutations) {
        $('#gpml_lyrics_container').height($('#content-container').height());
        $('#gpml_lyrics_content').height($('#content-container').height() - 70);
      });
  
  mutationObserver.observe(document.querySelector('#content-container'), { attributes: true });
  
}

/**************
 * PLUGINS 
 **************/
 // Lyrics Wiki
function LyricsWikiPlugin() {}
LyricsWikiPlugin.prototype.getUrl = function(song, artist) {      
  song = capitalizeFirstLetterEachWord(song).replace(/ /g, '_').replace(/,/g, '');
  artist = capitalizeFirstLetterEachWord(artist).replace(/ /g, '_').replace(/,/g, ''); 
  return 'http://lyrics.wikia.com/'+artist+':'+song;  
}
LyricsWikiPlugin.prototype.getMethod = function() {
  return "GET";
}
LyricsWikiPlugin.prototype.parseLyrics = function(responseText) {
  var lyrics = $('.lyricbox', responseText);
  $('div', lyrics).each(function() {$(this).remove()});
  $('span', lyrics).each(function() {$(this).remove()});
  lyrics = $(lyrics).html();
  return lyrics;
}

 // Terra
function TerraPlugin() {}
TerraPlugin.prototype.getUrl = function(song, artist) {      
  song = escape(song.replace(/,/g, ''));
  artist = escape(artist.replace(/,/g, '')); 
  return "http://letras.mus.br/winamp.php?musica=" + song + "&artista=" + artist; 
}
TerraPlugin.prototype.getMethod = function() {
  return "GET";
}
TerraPlugin.prototype.parseLyrics = function(responseText) {
  var lyrics = $('#letra > p', responseText);
  lyrics = $(lyrics).html();
  return lyrics;
}

/**************
 * RUNTIME
 **************/
var fetcher = new GooglePlayMusicLyricsFetcher();
fetcher.addPlugin(new LyricsWikiPlugin());
fetcher.addPlugin(new TerraPlugin());

$(document).ready(function() {
  fetcher.init();
  fetcher.fetchSong();
});