!define MOYE_PROGID "app.moye.reader.Markdown"
!define MOYE_CAPABILITIES "Software\Moye\Capabilities"

!macro MOYE_REGISTER_EXT EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MOYE_PROGID}" ""
  WriteRegStr SHCTX "${MOYE_CAPABILITIES}\FileAssociations" ".${EXT}" "${MOYE_PROGID}"
!macroend

!macro MOYE_REMOVE_EXT EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MOYE_PROGID}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Register an option in Open with. Leave the extension default and UserChoice untouched.
  WriteRegStr SHCTX "Software\Classes\${MOYE_PROGID}" "" "Markdown Document"
  WriteRegStr SHCTX "Software\Classes\${MOYE_PROGID}\DefaultIcon" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0'
  WriteRegStr SHCTX "Software\Classes\${MOYE_PROGID}\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
  WriteRegStr SHCTX "${MOYE_CAPABILITIES}" "ApplicationName" "Moye"
  WriteRegStr SHCTX "${MOYE_CAPABILITIES}" "ApplicationDescription" "Moye Markdown Reader"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Moye" "${MOYE_CAPABILITIES}"
  !insertmacro MOYE_REGISTER_EXT "md"
  !insertmacro MOYE_REGISTER_EXT "markdown"
  !insertmacro MOYE_REGISTER_EXT "mdown"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MOYE_REMOVE_EXT "md"
  !insertmacro MOYE_REMOVE_EXT "markdown"
  !insertmacro MOYE_REMOVE_EXT "mdown"
  DeleteRegKey SHCTX "Software\Classes\${MOYE_PROGID}"
  DeleteRegKey SHCTX "${MOYE_CAPABILITIES}"
  DeleteRegKey /ifempty SHCTX "Software\Moye"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Moye"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
!macroend
