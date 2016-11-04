// node modules
window.jQuery = window.$ = require('jquery')
import Vue     from 'vue';
import Clipboard from 'clipboard';
// scss
require('./../scss/pritify.scss')
require('./../scss/spinner.scss')
require('./../scss/app.scss')
require('./../scss/slider.scss')

// initiating vue instance
var vm = new Vue({
  el:"#app",
  template:"#application",
  mounted() {
    var clipboard = new Clipboard('.copybtn');
    clipboard.on('success', function(e) {
      document.getElementById("copied").style.display = "block";
      e.clearSelection();
    });
  },
  data: {
    auto:true,
    query:"",
    fixType: "",
    emoji: false,
    cleanHtml: true,
    error:false,
    ticketId: "",
    ticketIdError: false,
    loading:false,
    generatedCode: "",
    manual: {
      type: "tktFix",
      description:"",
      descriptionHtml:"",
      accountId:"",
      body:"",
      bodyHtml:"",
      fullText:"",
      noteId:"",
    }
  },
  // computed
  computed:{
    // manual type
    manualType: function() {

      this.ticketId = "";
      this.emoji = false;
      this.generatedCode = "";

      if(this.manual.type == "tktFix") {
        return true;
      } else {
        return false;
      }
    }
  },
  // watchers
  watch: {
    auto: function() {
      let _this = this;
      for (let d in this.manual) {
        _this.manual[d] = "";
      }
      this.ticketId = "";
      this.emoji = false;
      this.generatedCode = "";
      this.manual.type = "tktFix"
    }
  },
  methods: {
    generateCode: function() {
      this.generatedCode = "";
      // has invalid emoji check
      if(this.query.indexOf("�")) {
        this.emoji = true;
      } else {
        this.emoji = false;
      }
      // checking for ticket display id
      if(!this.ticketId) {
        this.ticketIdError = true;
        return;
      } else {
        this.ticketIdError = false;
      }

      // codes for ticket data fix
      if(this.query.indexOf(`helpdesk_ticket_bodies`) > -1) {
        this.fixType = "Ticket Fix";
        this.error = false;
        this.tickeFix();
      }
      else if(this.query.indexOf(`helpdesk_note_bodies`) > -1) {
        this.fixType = "Note Fix";
        this.error = false;
        this.noteFix();
      }
      else {
        this.error = true;
      }
    },
    tickeFix: function() {
        this.loading = true;
        let _this = this;
        let templateData = {};
        let query = this.query;
        $.ajax({
          url:"parser",
          type:"POST",
          data: {
            code: query,
            table: "helpdesk_ticket_bodies"
          },
          success: function(data) {
            templateData.accountId = data.account_id;
            templateData.description = _this.cleanEmoji(data.description);
            var promise = new Promise((resolve,reject) => {
              _this.cleanHtml(_this.cleanEmoji(data.description_html),resolve,reject);
            });
            promise.then((data) => {
              templateData.descriptionHtml = data;
              _this.tktFixTemplate(templateData);
            },(err) => {
              alert("Something went wrong !");
            });
          },
          error: function() {
            alert("Something went wrong !");
          }
        });
    },
    noteFix: function() {
      this.loading = true;
      let _this = this;
      let templateData = {};
      let query = this.query;
      $.ajax({
        url:"parser",
        type:"POST",
        data: {
          code: query,
          table: "helpdesk_note_bodies"
        },
        success: function(data) {
          templateData.body = _this.cleanEmoji(data.body);
          templateData.full_text = _this.cleanEmoji(data.full_text);
          templateData.account_id = data.account_id;
          templateData.note_id = data.note_id;
          var promise = new Promise((resolve,reject) => {
            _this.cleanHtml(_this.cleanEmoji(data.body_html),resolve,reject);
          });
          promise.then((data) => {
            templateData.body_html = data;
            this.loading = false;
            _this.noteFixTemplate(templateData);
          })
        }
      });
    },
    getValues: function() {
      let regex = /VALUES \(([\w\W]*?)\)/g;
      let str = this.query;
      let m;
      while ((m = regex.exec(str)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (m.index === regex.lastIndex) {
              regex.lastIndex++;
          }
          return m[1];
      }
    },

    cleanEmoji: function(data) {
      let temp = data.replace(/�/g,"");
      // if(!html) {
      //   temp = temp.replace(/\\n/g, '');
      // } else {
      //   temp = temp.replace(/\\n/g, '<br />');
      // }
      return temp;
    },
    cleanHtml: function(html,resolve,reject) {
      html = html.replace(/\\"/g,'');
      $.ajax({
        url:"/clean-html",
        type:"POST",
        data: {
          code:html,
        },
        success: function(data) {
          data = JSON.parse(data);
          let regex = /<body>([\w\W]*?)<\/body>/g;
          let str = data.clean;
          let m;
          let result;
          while ((m = regex.exec(str)) !== null) {
              // This is necessary to avoid infinite loops with zero-width matches
              if (m.index === regex.lastIndex) {
                  regex.lastIndex++;
              }
              result = m[1];
          }
          $.ajax({
            url:"/minify",
            type:"POST",
            data: {
              code:html,
            },
            success: function(data) {
              resolve(data.replace(/"/g,'\\"'));
            },
            error: function(data) {
              alert("something went wrong");
            }
          });
        },
        error:function(data) {
          reject(data)
        }
      });
    },
    tktFixTemplate: function(data) {
      let tktFixTemplate = `
         description = "${data.description}"


          description_html = "${data.descriptionHtml}"


          @script_tickets2 = {}
          account_id = ${data.accountId}
          Sharding.select_shard_of(account_id) do
          account = Account.find_by_id(account_id).make_current
          ticket = account.tickets.find_by_display_id ${this.ticketId}
          ticket_old_body = ticket.ticket_old_body


          @script_tickets2[:body] = ticket_old_body.description
          @script_tickets2[:body_html] = ticket_old_body.description_html


          ticket_old_body.description = description
          ticket_old_body.description_html = description_html
          ticket_old_body.save!
          end `;
      this.generatedCode = tktFixTemplate;
      this.loading = false;
      this.doPrettify();
    },
    noteFixTemplate: function(data) {
       let noteFixTemplate = `
       body = "${data.body}"

       body_html = "${data.body_html}"

       full_text = "${data.full_text}"

       full_text_html = body_html

      @script_tickets = {}
      account_id = ${data.account_id}
      Sharding.select_shard_of(account_id) do
        account = Account.find_by_id(account_id).make_current
        ticket = account.tickets.find_by_display_id ${this.ticketId}
        note= ticket.notes.find_by_id ${data.note_id}
        note_old_body = note.note_old_body


        @script_tickets[:body] = note_old_body.body
        @script_tickets[:body_html] = note_old_body.body_html
        @script_tickets[:full_text] = note_old_body.full_text
        @script_tickets[:full_text_html] = note_old_body.full_text_html


        note_old_body.body = body
        note_old_body.body_html = body_html
        note_old_body.full_text = full_text
        note_old_body.full_text_html = full_text_html
        note_old_body.save!
      end
       `;
       this.generatedCode = noteFixTemplate;
       this.loading = false;
       this.doPrettify();
    },
    doPrettify: function() {
      setTimeout(function(){ PR.prettyPrint() }, 1000);
    },
    manualCodeGenerate: function() {
      // has invalid emoji check
      if(this.manual.description.indexOf("�") > -1 || this.manual.descriptionHtml.indexOf("�") > -1 ) {
        this.emoji = true;
      } else {
        this.emoji = false;
      }

      if(this.manual.type == "tktFix") {
         this.loading = true;
         let templateData = {};
         let _this = this;
         _this.fixType = "Ticket Fix";
         templateData.accountId = _this.manual.accountId;
         templateData.description = _this.cleanEmoji(_this.manual.description);
         var promise = new Promise((resolve,reject) => {
           _this.cleanHtml(_this.cleanEmoji(_this.manual.descriptionHtml),resolve,reject);
         });
         promise.then((data) => {
           templateData.descriptionHtml = data;
           _this.tktFixTemplate(templateData);
         },(err) => {
           alert("Something went wrong !");
         });
      }
      if(this.manual.type == "noteFix") {
        this.loading = true;
        let templateData = {};
        let _this = this;
        _this.fixType = "Note Fix";
        templateData.body = _this.cleanEmoji(_this.manual.body);
        templateData.full_text = _this.cleanEmoji(_this.manual.fullText);
        templateData.account_id = _this.manual.accountId;
        templateData.note_id = _this.manual.noteId;
        var promise = new Promise((resolve,reject) => {
          _this.cleanHtml(_this.cleanEmoji(_this.manual.bodyHtml),resolve,reject);
        });
        promise.then((data) => {
          templateData.body_html = data;
          this.loading = false;
          _this.noteFixTemplate(templateData);
        })

      }
    }
  }
});
