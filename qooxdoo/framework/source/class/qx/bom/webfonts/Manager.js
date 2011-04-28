/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

************************************************************************ */

/**
 * Manages font-face definitions, making sure that each rule is only applied
 * once.
 */
qx.Class.define("qx.bom.webfonts.Manager", {

  extend : qx.core.Object,
  
  type : "singleton",


  /*
  *****************************************************************************
     CONSTRUCTOR
  *****************************************************************************
  */

  construct : function()
  {
    this.base(arguments);
    this.__createdStyles = [];
    this.__validators = {};
    this.__queue = [];
    this.__preferredFormats = this.getPreferredFormats();
  },



  /*
  *****************************************************************************
     STATICS
  *****************************************************************************
  */

  statics :
  {
    /**
     * List of known font definition formats (i.e. file extensions). Used to 
     * identify the type of each font file configured for a web font.
     */
    FONT_FORMATS : ["eot", "woff", "ttf", "svg"],

    /**
     * Timeout (in ms) to wait before deciding that a web font was not loaded.
     */
    VALIDATION_TIMEOUT : 5000
  },



  /*
  *****************************************************************************
     MEMBERS
  *****************************************************************************
  */

  members :
  {
    __createdStyles : null,
    __styleSheet : null,
    __validators : null,
    __preferredFormats : null,
    __queue : null,
    __queueInterval : null,


    /*
    ---------------------------------------------------------------------------
      PUBLIC API
    ---------------------------------------------------------------------------
    */

    /**
     * Adds the necessary font-face rule for a web font to the document. Also
     * creates a web font Validator ({@link qx.bom.webfonts.Validator}) that 
     * checks if the webFont was applied correctly.
     * 
     * @param familyName {String} Name of the web font
     * @param sources {String[]} List of source URLs. For maximum compatibility,
     * this should include EOT, WOFF and TTF versions of the font.
     * @param callback {Function?} Optional event listener callback that will be
     * executed once the validator has determined whether the webFont was 
     * applied correctly. 
     * See {@link qx.bom.webfonts.Validator#fontValid} and 
     * {@link qx.bom.webfonts.Validator#fontInvalid}
     * @param context {Object?} Optional context for the callback function
     */
    require : function(familyName, sources, callback, context)
    {
      // old IEs need a break in between adding @font-face rules
      if (!(qx.core.Environment.get("browser.name") == "ie" && 
      qx.bom.client.Browser.getVersion() < 9)) {
        this.__require(familyName, sources, callback, context);
        return;
      }
      
      if (!this.__queueInterval) {
        this.__queueInterval = new qx.event.Timer(100);
        this.__queueInterval.addListener("interval", this.__flushQueue, this);
      }
      
      if (!this.__queueInterval.isEnabled()) {
        this.__queueInterval.start();
      }
      
      this.__queue.push([familyName, sources, callback, context]);
    },


    /**
     * Removes a font's font-face definition from the style sheet. This means
     * the font will no longer be available and any elements using it will 
     * fall back to the their regular font-families.
     * 
     * @param familyName {String} font-family name
     */
    remove : function(familyName) {
      var index = null;
      for (var i=0,l=this.__createdStyles.length; i<l; i++) {
        if (this.__createdStyles[i] == familyName) {
          index = i;
          this.__removeRule(familyName);
          break;
        }
      }
      if (index) {
        qx.lang.Array.removeAt(this.__createdStyles, index);
      }
      if (familyName in this.__validators) {
        this.__validators[familyName].dispose();
        delete this.__validators[familyName];
      }
    },
    
    
    /**
     * Returns the preferred font format(s) for the currently used browser. Some 
     * browsers support multiple formats, e.g. WOFF and TTF or WOFF and EOT. In
     * those cases, WOFF is considered the preferred format.
     * 
     * @return {String[]} List of supported font formats ordered by preference 
     * or empty Array if none could be determined
     */
    getPreferredFormats : function()
    {
      var preferredFormats = [];
      var browser = qx.core.Environment.get("browser.name");
      var browserVersion = qx.core.Environment.get("browser.version");
      var os = qx.core.Environment.get("os.name");
      var osVersion = qx.core.Environment.get("os.version");
      
      if ((browser == "ie" && browserVersion >= 9) ||
          (browser == "firefox" && browserVersion >= 3.6) ||
          (browser == "chrome" && browserVersion >= 6)) {
        preferredFormats.push("woff");
      }
      
      if ((browser == "opera" && browserVersion >= 10) ||
          (browser == "safari" && browserVersion >= 3.1) ||
          (browser == "firefox" && browserVersion >= 3.5) ||
          (browser == "chrome" && browserVersion >= 4) ||
          (browser == "mobile safari" && os == "ios" && osVersion >= 4.2)) {
        preferredFormats.push("ttf");
      }
      
      if (browser == "ie" && browserVersion >= 4) {
        preferredFormats.push("eot");
      }
      
      if (browser == "mobileSafari" && os == "ios" && osVersion >= 4.1) {
        preferredFormats.push("svg");        
      }
      
      return preferredFormats;
    },
    
    
    /**
     * Removes the styleSheet element used for all web font definitions from the
     * document. This means all web fonts declared by the manager will no longer
     * be available and elements using them will fall back to their regular 
     * font-families
     */
    removeStyleSheet : function()
    {
      this.__createdStyles = [];
      if (this.__styleSheet && this.__styleSheet.ownerNode) {
        qx.dom.Element.removeChild(this.__styleSheet.ownerNode, 
          this.__styleSheet.ownerNode.parentNode);
      }
      this.__styleSheet = null;
    },



    /*
    ---------------------------------------------------------------------------
      PRIVATE API
    ---------------------------------------------------------------------------
    */

    /**
     * Does the actual work of adding stylesheet rules and triggering font
     * validation
     * 
     * @param familyName {String} Name of the web font
     * @param sources {String[]} List of source URLs. For maximum compatibility,
     * this should include EOT, WOFF and TTF versions of the font.
     * @param callback {Function?} Optional event listener callback that will be
     * executed once the validator has determined whether the webFont was 
     * applied correctly. 
     * See {@link qx.bom.webfonts.Validator#fontValid} and 
     * {@link qx.bom.webfonts.Validator#fontInvalid}
     * @param context {Object?} Optional context for the callback function
     */
    __require : function(familyName, sources, callback, context)
    {
      var browser = qx.core.Environment.get("browser.name");
      var version = qx.core.Environment.get("browser.version");   
      if ((browser == "firefox" && version < 3.5) ||
          (browser == "opera" && version < 10))
      {
        if (qx.core.Environment.get("qx.debug")) {
          this.warn("This browser does not support @font-face");
        }
        return;
      }
      
      if (!qx.lang.Array.contains(this.__createdStyles, familyName)) {
        var sourcesMap = this.__getSourcesMap(sources);
        var rule = this.__getRule(familyName, sourcesMap);
        
        if (!rule) {
          throw new Error("Couldn't create @font-face rule for WebFont " + familyName + "!");
        }
        this.__addRule(rule);
        this.__createdStyles.push(familyName);
      }
        
      if (!this.__validators[familyName]) {
        this.__validators[familyName] = new qx.bom.webfonts.Validator(familyName);
        this.__validators[familyName].setTimeout(qx.bom.webfonts.Manager.VALIDATION_TIMEOUT);
        this.__validators[familyName].addListener("fontInvalid", this.__onFontInvalid, this);
      }
      
      if (callback) {
        var cbContext = context || window;
        this.__validators[familyName].addListener("fontValid", callback, cbContext);
        this.__validators[familyName].addListener("fontInvalid", callback, cbContext);
      }
      
      this.__validators[familyName].validate();
    },
    
    
    /**
     * Processes the next item in the queue
     */
    __flushQueue : function()
    {
      if (this.__queue.length == 0) {
        this.__queueInterval.stop();
        return;
      }
      var next = this.__queue.shift();
      this.__require.apply(this, next);
    },
    
    
    /**
     * Removes the font-face declaration if a font could not be validated
     * 
     * @param ev {qx.event.type.Data} qx.bom.webfonts.Validator#fontValid or
     * qx.bom.webfonts.Validator#fontInvalid
     */
    __onFontInvalid : function(ev)
    {
      var familyName = ev.getData();
      this.remove(familyName);
    },
    
    
    /**
     * Uses a naive regExp match to determine the format of each defined source
     * file for a webFont. Returns a map with the format names as keys and the
     * corresponding source URLs as values.
     * 
     * @param sources {String[]} Array of source URLs
     * @return {Map} Map of formats and URLs
     */
    __getSourcesMap : function(sources)
    {
      var formats = qx.bom.webfonts.Manager.FONT_FORMATS;
      var sourcesMap = {};
      for (var i=0, l=sources.length; i<l; i++) {
        var type = null;
        for (var x=0; x < formats.length; x++) {
          var reg = new RegExp("\.(" + formats[x] + ")");
          var match = reg.exec(sources[i]);
          if (match) {
            type = match[1];
          }
        }
        
        if (type) {
          sourcesMap[type] = sources[i]
        }
      }
      return sourcesMap;
    },
    
    
    /**
     * Assembles the body of a font-face rule for a single webFont.
     * 
     * @param familyName {String} Font-family name
     * @param sourcesMap {Map} Map of font formats and sources
     * @return {String} The computed CSS rule
     */
    __getRule : function(familyName, sourcesMap)
    {
      var rules = [];

      var formatList = this.__preferredFormats.length > 0 
        ? this.__preferredFormats : qx.bom.webfonts.Manager.FONT_FORMATS; 

      for (var i=0,l=formatList.length; i<l; i++) {
        var format = formatList[i];
        if (sourcesMap[format]) {
          rules.push(this.__getSourceForFormat(format, sourcesMap[format]));
        }
      }

      var rule = "src: " + rules.join(",\n") + ";";
      
      rule = "font-family: " + familyName + ";\n" + rule;
      rule = rule + "\nfont-style: normal;\nfont-weight: normal;";

      return rule;
    },
    
    
    /**
     * Returns the full src value for a given font URL depending on the type

     * @param format {String} The font format, one of eot, woff, ttf, svg
     * @param url {String} The font file's URL
     * @return {String} The src directive
     */
    __getSourceForFormat : function(format, url)
    {
      switch(format) {
        case "eot":
          return "url('" + url + "?#iefix') format('eot')";
        case "woff":
          return "url('" + url + "') format('woff')";
        case "ttf":
          return "url('" + url + "') format('truetype')";
        case "svg":
          return "url('" + url + "') format('svg')";
        default:
          return null;
      }
    },
    
    
    /**
     * Adds a font-face rule to the document
     * 
     * @param rule {String} The body of the CSS rule
     */
    __addRule : function(rule)
    {
      if (!this.__styleSheet) {
        this.__styleSheet = qx.bom.Stylesheet.createElement();
      }
      
      var completeRule = "@font-face {" + rule + "}\n";
      
      if (qx.core.Environment.get("browser.name") == "ie" &&
          qx.core.Environment.get("browser.version") < 9) {
        this.__styleSheet.cssText += completeRule;
      }
      else {
        this.__styleSheet.insertRule(completeRule, this.__styleSheet.cssRules.length);
      }
    },
    
    
    /**
     * Removes the font-face declaration for the given font-family from the 
     * stylesheet
     * 
     * @param familyName {String} The font-family name
     */
    __removeRule : function(familyName)
    {
      var reg = new RegExp("@font-face.*?" + familyName, "m");
      var rules = this.__styleSheet.cssRules || this.__styleSheet.rules;
      for (var i=0,l=rules.length; i<l; i++) {
        var cssText = rules[i].cssText.replace(/\n/g, "");
        if (reg.exec(cssText)) {
          this.__styleSheet.deleteRule(i);
          break;
        }
      }
    }
  
  },
  
  /*
  *****************************************************************************
    DESTRUCTOR
  *****************************************************************************
  */
  
  destruct : function()
  {
    delete this.__createdStyles;
    this.removeStyleSheet();
    for (var prop in this.__validators) {
      this.__validators[prop].dispose();
    }
    qx.bom.webfonts.Validator.removeDefaultHelperElements();
  }
});