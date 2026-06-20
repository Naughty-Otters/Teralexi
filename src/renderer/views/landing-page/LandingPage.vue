<template>
  <div id="wrapper">
    <img id="logo" :src="openfdeLogo" alt="OpenFDE" />
    <main>
      <div class="left-side">
        <span class="title">
          {{ i18nt.landing.welcome }}
        </span>
        <system-information></system-information>
      </div>

      <!--  -->
      <div class="right-side">
        <div class="doc">
          <div class="title alt">
            {{ i18nt.landing.buttonTips }}
          </div>
          <button class="btu" @click="open()">
            {{ i18nt.landing.buttons.console }}
          </button>
          <button class="btu" @click="CheckUpdate('one')">
            {{ i18nt.landing.buttons.checkUpdate }}
          </button>
          <button class="btu" @click="CheckUpdate('two')">
            {{ i18nt.landing.buttons.checkUpdate2 }}
          </button>
          <button class="btu" @click="CheckUpdate('three')">
            {{ i18nt.landing.buttons.checkUpdateInc }}
          </button>
          <!-- <button class="btu" @click="CheckUpdate('four')">
            {{ i18nt.landing.buttons.forcedUpdate }}
          </button> -->
          <button class="btu" @click="getMessage">
            {{ i18nt.landing.buttons.viewMessage }}
          </button>
          <button class="btu" @click="startCrash">
            {{ i18nt.landing.buttons.simulatedCrash }}
          </button>
          <button class="btu" @click="openNewWin">
            {{ i18nt.landing.buttons.openNewWindow }}
          </button>
          <button class="btu" @click="changeLanguage">
            {{ i18nt.landing.buttons.changeLanguage }}
          </button>
        </div>
        <div class="doc">
          <testComp />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import SystemInformation from './components/system-info-mation.vue'
import { openfdeLogo } from '@renderer/assets/icons'
import { ref } from 'vue'
import { i18nt, setLanguage, globalLang, getSupportedLocales } from '@renderer/i18n'
import { useStoreTemplate } from '@renderer/store/modules/template'
import testComp from '@renderer/components/test-comp.vue'

const { ipcRendererChannel, crash } = window

const percentage = ref(0)
const colors = ref([
  { color: '#f56c6c', percentage: 20 },
  { color: '#e6a23c', percentage: 40 },
  { color: '#6f7ad3', percentage: 60 },
  { color: '#1989fa', percentage: 80 },
  { color: '#5cb87a', percentage: 100 },
] as string | ColorInfo[])
const dialogVisible = ref(false)
const progressStaus = ref<string | null>(null)
const filePath = ref('')
const updateStatus = ref('')
const showForcedUpdate = ref(false)

const storeTemplate = useStoreTemplate()

console.log(`storeTemplate`, storeTemplate.getTest)
console.log(`storeTemplate`, storeTemplate.getTest1)
console.log(`storeTemplate`, storeTemplate.$state.testData)

setTimeout(() => {
  storeTemplate.TEST_ACTION('654321')
  console.log(`storeTemplate`, storeTemplate.getTest1)
}, 1000)

function changeLanguage() {
  const ids = getSupportedLocales().map((entry) => entry.id)
  const index = ids.indexOf(globalLang.value)
  setLanguage(ids[(index + 1) % ids.length] ?? 'en')
}

function startCrash() {
  crash.start()
}

function openNewWin() {
  const data = {
    url: '/form/index',
  }
  ipcRendererChannel.OpenWin.invoke(data)
}
function getMessage() {
  console.log('API is obsolete')
}
function StopServer() {
  ipcRendererChannel.StopServer.invoke()
}
function StartServer() {
  ipcRendererChannel.StartServer.invoke()
}
// Get electron methods
function open() {}
function CheckUpdate(data: string) {
  switch (data) {
    case 'one':
      ipcRendererChannel.CheckUpdate.invoke()
      console.log('Startup check')
      break
    case 'two':
      ipcRendererChannel.StartDownload.invoke('https://xxx').then(() => {
        dialogVisible.value = true
      })
      break
    case 'three':
      ipcRendererChannel.HotUpdate.invoke()
      break
    case 'four':
      showForcedUpdate.value = true
      break

    default:
      break
  }
}
function handleClose() {
  dialogVisible.value = false
}

ipcRendererChannel.DownloadProgress.on((event, arg) => {
  percentage.value = Number(arg)
})
ipcRendererChannel.DownloadError.on((event, arg) => {
  if (arg) {
    progressStaus.value = 'exception'
    percentage.value = 40
    colors.value = '#d81e06'
  }
})
ipcRendererChannel.DownloadPaused.on((event, arg) => {
  if (arg) {
    progressStaus.value = 'warning'
    // ElMessageBox.alert("Download interrupted due to unknown reason!", "Hint", {
    //   confirmButtonText: "Retry",
    //   callback: (action) => {
    //     ipcRenderer.invoke("start-download");
    //   },
    // });
  }
})
ipcRendererChannel.DownloadDone.on((event, age) => {
  filePath.value = age.filePath
  progressStaus.value = 'success'
  // ElMessageBox.alert("Update download complete!", "Hint", {
  //   confirmButtonText: "Confirm",
  //   callback: (action) => {
  //     shell.shell.openPath(filePath.value);
  //   },
  // });
})
// electron-updater upload
ipcRendererChannel.updateMsg.on((event, message) => {
  switch (message.phase) {
    case 'error':
      dialogVisible.value = false
      ipcRendererChannel.OpenErrorbox.invoke({
        title: 'Error occurred',
        message: message.error ?? 'Update failed',
      })
      break
    case 'checking':
      console.log('check-update')
      break
    case 'available':
      dialogVisible.value = true
      console.log('has update')
      break
    case 'not-available':
      console.log('not new version')
      break
    case 'downloading':
      percentage.value = Number(message.percent ?? 0)
      break
    case 'downloaded':
      progressStaus.value = 'success'
      ipcRendererChannel.ConfirmUpdate.invoke()
      break
    default:
      break
  }
})
ipcRendererChannel.UpdateProcessStatus.on((event, msg) => {
  switch (msg.status) {
    case 'downloading':
      console.log('Downloading')
      break
    case 'moving':
      console.log('Moving files')
      break
    case 'finished':
      console.log('Success, please restart')
      break
    case 'failed':
      console.log('msg.message.message')
      break

    default:
      break
  }
  console.log(msg)
  updateStatus.value = msg.status
})
</script>

<style scoped lang="scss">
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Source Sans Pro', sans-serif;
}

#wrapper {
  padding: 124px 80px;
}

#logo {
  height: auto;
  margin-bottom: 20px;
  max-width: min(280px, 100%);
  width: 100%;
}

main {
  display: flex;
  justify-content: space-between;
}

main > div {
  flex-basis: 50%;
}

.left-side {
  display: flex;
  flex-direction: column;
}

.welcome {
  color: #555;
  font-size: 23px;
  margin-bottom: 10px;
}

.title {
  color: #2c3e50;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 6px;
}

.title.alt {
  font-size: 18px;
  margin-bottom: 10px;
}

.doc {
  margin-bottom: 10px;
}

.doc p {
  color: black;
  margin-bottom: 10px;
}

.doc {
  button {
    margin-top: 10px;
    margin-right: 10px;
  }

  .btu {
    display: inline-block;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    color: #fff;
    background-color: #409eff;
    border: 1px solid #409eff;
    text-align: center;
    box-sizing: border-box;
    outline: none;
    transition: 0.1s;
    font-weight: 500;
    padding: 12px 20px;
    font-size: 14px;
    border-radius: 4px;
  }

  .btu:focus,
  .btu:hover {
    background: #3a8ee6;
    border-color: #3a8ee6;
  }
}

.doc .button + .button {
  margin-left: 0;
}

.conten {
  text-align: center;
}
</style>
