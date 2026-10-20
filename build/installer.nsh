; Included by electron-builder (NSIS).
; 1. Remembers the language picked in the installer: the app applies it on first launch
;    (electron/i18n.ts), then the language is changed from Settings.
; 2. Checks for the VB-CABLE virtual cable (what OBS records as a microphone). If it is
;    missing, offers to download the official package and opens VB-Audio's own installer.
;    Skipped on silent installs: the in-app updates never ask again.

!macro customInstall
  WriteRegStr HKCU "Software\Cursed Voices" "InstallerLanguage" "$LANGUAGE"

  ${IfNot} ${Silent}
    nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\scripts\install-vbcable.ps1" -Check'
    Pop $0
    Pop $1
    ${If} $0 == "1"
      ${If} $LANGUAGE == 1036
        MessageBox MB_YESNO|MB_ICONQUESTION "Pour que ta voix modifiée apparaisse comme un micro dans OBS, Discord ou Twitch Studio, Cursed Voices utilise le câble audio virtuel VB-CABLE (gratuit, par VB-Audio).$\r$\n$\r$\nLe télécharger depuis vb-audio.com et ouvrir son installateur maintenant ?$\r$\n$\r$\n(Dans la fenêtre VB-Audio, clique sur « Install Driver ». Un redémarrage du PC peut être demandé.)" IDNO cv_skip
      ${Else}
        MessageBox MB_YESNO|MB_ICONQUESTION "To show your changed voice as a microphone in OBS, Discord or Twitch Studio, Cursed Voices uses the VB-CABLE virtual audio cable (free, by VB-Audio).$\r$\n$\r$\nDownload it from vb-audio.com and open its installer now?$\r$\n$\r$\n(In the VB-Audio window, click « Install Driver ». A reboot may be requested.)" IDNO cv_skip
      ${EndIf}
      nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\scripts\install-vbcable.ps1"'
      Pop $0
      Pop $1
      ${If} $0 != "0"
        ${If} $LANGUAGE == 1036
          MessageBox MB_OK|MB_ICONINFORMATION "Le câble virtuel n'a pas été installé. Tu pourras le faire plus tard depuis Cursed Voices : Paramètres > OBS & Stream."
        ${Else}
          MessageBox MB_OK|MB_ICONINFORMATION "The virtual cable was not installed. You can do it later from Cursed Voices: Settings > OBS & Stream."
        ${EndIf}
      ${EndIf}
      cv_skip:
    ${EndIf}
  ${EndIf}
!macroend
