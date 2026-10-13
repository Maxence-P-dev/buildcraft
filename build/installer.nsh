; Branded texts for the BuildCraft installer (electron-builder NSIS hooks).

!macro customHeader
  !define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
  !define MUI_FINISHPAGE_TITLE "BuildCraft est prêt !"
  !define MUI_FINISHPAGE_TEXT "BuildCraft a bien été installé sur ton ordinateur.$\r$\n$\r$\nTes serveurs seront créés dans Documents\BuildCraft\serveurs. Java et PHP sont téléchargés automatiquement au premier serveur.$\r$\n$\r$\nBon build !"
  !define MUI_FINISHPAGE_RUN_TEXT "Lancer BuildCraft maintenant"
  !define MUI_FINISHPAGE_LINK "Voir le projet sur GitHub"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/Maxence-P-dev/buildcraft"
  !define MUI_UNWELCOMEPAGE_TITLE "Désinstaller BuildCraft"
  !define MUI_UNWELCOMEPAGE_TEXT "BuildCraft va être retiré de ton ordinateur.$\r$\n$\r$\nTes serveurs et tes plugins ne seront pas supprimés : ils restent dans Documents\BuildCraft."
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenue dans BuildCraft"
  !define MUI_WELCOMEPAGE_TEXT "L'atelier IA pour serveurs Minecraft Bedrock.$\r$\n$\r$\n•  Crée un vrai serveur PowerNukkitX ou PocketMine en un clic$\r$\n•  Décris un plugin, l'IA le code, le compile et le teste$\r$\n•  Elle lit la documentation et retient ses leçons$\r$\n•  Claude ou IA locale gratuite$\r$\n•  Console, éditeur de code et réglages intégrés$\r$\n$\r$\nClique sur Suivant pour commencer l'installation."
  !insertmacro MUI_PAGE_WELCOME
!macroend
