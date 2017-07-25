import es6Template   from 'es6-template';
import PostCSS       from 'typhonjs-postcss';

/**
 * Provides an orchestration module / plugin for CSS theme construction.
 */
export default class ThemeEngine
{
   /**
    * Instantiate ThemeEngine.
    */
   constructor()
   {
      this._postcss = new PostCSS();
   }

   /**
    * Wires up ThemeEngine on the plugin eventbus.
    *
    * @param {PluginEvent} ev - The plugin event.
    */
   onPluginLoad(ev)
   {
      this._eventbus = ev.eventbus;

      this._eventbus.on('typhonjs:theme:engine:create', this.createTheme, this);
      this._eventbus.on('typhonjs:theme:engine:css:append', this.cssAppend, this);
      this._eventbus.on('typhonjs:theme:engine:css:append:all', this.cssAppendAll, this);
      this._eventbus.on('typhonjs:theme:engine:css:prepend', this.cssPrepend, this);
      this._eventbus.on('typhonjs:theme:engine:css:prepend:all', this.cssPrependAll, this);
      this._eventbus.on('typhonjs:theme:engine:finalize', this.finalizeTheme, this);
   }

   /**
    * Creates a theme which defaults to just a `styles.css` and `CSSNext` as the only PostCSS processor.
    *
    * @param {string|Array<string>} [files='styles.css'] - A string or array of strings for CSS files associated with
    *                                                      a theme.
    *
    * @param {Array<object>}        [processors=[{ name: 'postcss-cssnext' }]] - PostCSS processors.
    *
    * @param {boolean}              [silent=false] - When true any logging is skipped.
    */
   async createTheme({ files = 'styles.css', processors = [{ name: 'postcss-cssnext' }], silent = false } = {})
   {
      if (!Array.isArray(files) && typeof files !== 'string')
      {
         throw new TypeError(`'files' is not a 'string' or 'array'.`);
      }

      if (!Array.isArray(processors)) { throw new TypeError(`'processors' is not an 'array'.`); }

      if (typeof files === 'string')
      {
         this._postcss.create({ name: files, to: files, processors, silent });
      }
      else if (Array.isArray(files))
      {
         for (const entry of files)
         {
            this._postcss.create({ name: entry, to: entry, processors, silent });
         }
      }
   }

   /**
    * Internal implementation to append or prepend CSS.
    *
    * @param {string}   action - `append` or `prepend`
    *
    * @param {string}   [name='styles.css'] - Name of CSS entry to modify.
    *
    * @param {string}   dirName - The absolute directory to resolve.
    *
    * @param {string}   filePath - The relative CSS file path to resolve.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    *
    * @param {object}   [templateData] - Additional data is collected and applied against the filePath string for
    *                                    substitution.
    */
   async cssAdd(action = 'append', { name = 'styles.css', dirName = void 0, filePath = void 0, silent = false,
    ...templateData } = {})
   {
      if (typeof action !== 'string') { throw new TypeError(`'action' is not a 'string'.`); }
      if (action !== 'append' && action !== 'prepend') { throw new Error(`'action' is not 'append' or 'prepend'.`); }

      const structuralFilePath = es6Template(filePath);
      const themeFilePath = es6Template(filePath, templateData);

      action === 'append' ? this._postcss.append({ name, dirName, filePath: structuralFilePath, silent }) :
       this._postcss.prepend({ name, dirName, filePath: structuralFilePath, silent });

      const themeCSS = await this._eventbus.triggerAsync('typhonjs:theme:css:get',
       { name, filePath: themeFilePath, silent });

      if (Array.isArray(themeCSS))
      {
         for (const entry of themeCSS)
         {
            // If there are multiple separate themes installed then `themeCSS` is an array of arrays.
            if (Array.isArray(entry))
            {
               for (const entry2 of entry)
               {
                  action === 'append' ? this._postcss.append(entry2) : this._postcss.prepend(entry2);
               }
            }
            else
            {
               action === 'append' ? this._postcss.append(entry) : this._postcss.prepend(entry);
            }
         }
      }
      else
      {
         this._eventbus.trigger('log:error',
          `typhonjs-theme-engine cssAdd: 'themeCSS' is not an 'array'.`);
      }
   }

   /**
    * Appends css data to a CSS entry which defaults to `styles.css`.
    *
    * @param {object}      data - An object hash containing the data to append.
    *
    * @property {string}   [data.name='styles.css'] - Name of CSS entry to modify.
    *
    * @property {string}   data.dirName - The absolute directory to resolve.
    *
    * @property {string}   data.filePath - The relative CSS file path to resolve.
    *
    * @property {boolean}  [data.silent=false] - When true any logging is skipped.
    */
   async cssAppend(data = {})
   {
      await this.cssAdd('append', data);
   }

   /**
    * Appends all css data to a CSS entry which defaults to `styles.css`.
    *
    * @param {Array<object>}  data - An array of object hashes containing the data to append.
    *
    * @returns {Promise}
    */
   async cssAppendAll(data = [])
   {
      const promises = [];

      for (const entry of data) { promises.push(this.cssAdd('append', entry)); }

      return Promise.all(promises);
   }

   /**
    * Prepends css data to a CSS entry which defaults to `styles.css`.
    *
    * @param {object}      data - An object hash containing the data to append.
    *
    * @property {string}   [data.name='styles.css'] - Name of CSS entry to modify.
    *
    * @property {string}   data.dirName - The absolute directory to resolve.
    *
    * @property {string}   data.filePath - The relative CSS file path to resolve.
    *
    * @property {boolean}  [data.silent=false] - When true any logging is skipped.
    */
   async cssPrepend(data = {})
   {
      await this.cssAdd('prepend', data);
   }

   /**
    * Prepends all css data to a CSS entry which defaults to `styles.css`.
    *
    * @param {Array<object>}  data - An array of object hashes containing the data to prepend.
    *
    * @returns {Promise}
    */
   async cssPrependAll(data = [])
   {
      const promises = [];

      for (const entry of data) { promises.push(this.cssAdd('prepend', entry)); }

      return Promise.all(promises);
   }

   /**
    * Finalizes the theme and returns an object hash of css and resources that need to be copied.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    *
    * @returns {{css: Array<object>, copy: Array<object>}}
    */
   async finalizeTheme({ silent = false } = {})
   {
      const themeResources = await this._eventbus.triggerAsync('typhonjs:theme:resources:get');

      const copyResources = [];

      // Handle the case when multiple separate themes are loaded.
      if (Array.isArray(themeResources))
      {
         for (const resource of themeResources)
         {
            if (Array.isArray(resource.append) && resource.append.length)
            {
               for (const entry of resource.append)
               {
                  this._postcss.append(entry);
               }
            }

            if (Array.isArray(resource.prepend) && resource.prepend.length)
            {
               for (const entry of resource.prepend)
               {
                  this._postcss.prepend(entry);
               }
            }

            if (Array.isArray(resource.copy) && resource.copy.length)
            {
               copyResources.push(...resource.copy);
            }
         }
      }
      else if (typeof themeResources === 'object')
      {
         if (Array.isArray(themeResources.append) && themeResources.append.length)
         {
            for (const entry of themeResources.append)
            {
               this._postcss.append(entry);
            }
         }

         if (Array.isArray(themeResources.prepend) && themeResources.prepend.length)
         {
            for (const entry of themeResources.prepend)
            {
               this._postcss.prepend(entry);
            }
         }

         if (Array.isArray(themeResources.copy) && themeResources.copy.length)
         {
            copyResources.push(...themeResources.copy);
         }
      }

      const css = await this._postcss.finalizeAll({ silent });

      return { css, copy: copyResources };
   }
}
