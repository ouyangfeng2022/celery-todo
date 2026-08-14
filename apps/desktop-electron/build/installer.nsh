; ============================================================================
; installer.nsh — Celery Todo NSIS 自定义安装页
; ----------------------------------------------------------------------------
; 通过 electron-builder 的 nsis.include 字段引入。assistedInstaller.nsh 模板
; 在「目录选择」之后、「开始安装」之前预留了 customPageAfterChangeDir 钩子
; （assistedInstaller.nsh 第 ~134 行 insertmacro），我们在这里挂入一个自定义
; 页面，让用户选择：
;
;   [x] 使用自定义设置
;       [ ] 开机时自动启动
;       [x] 在桌面创建快捷方式
;       [x] 在开始菜单创建快捷方式
;       数据保存位置： ___________  [浏览…]
;
; 升级场景（electron-updater 自动升级，传 --updated 参数）下 ${isUpdated} 为
; true，PRE 函数开头直接 Abort 跳过本页 —— 老用户数据原样保留。
;
; 用户的选择会写入 $APPDATA\Celery Todo\install-options.json，主进程在
; app.whenReady 早期读取并应用，应用后删除该文件（一次性信箱）。
; 桌面 / 开始菜单快捷方式由本脚本直接创建/清理，不经过主进程。
;
; 重要约束：所有依赖 ${isUpdated} / StdUtils 插件的代码必须放在 customPageAfterChangeDir
; 宏内部 —— 该宏在 assistedInstaller.nsh 第 134 行被 insertmacro 展开，那时
; electron-builder 已经执行过 !addplugindir（第 100 行）。installer.nsh 文件体
; 本身在第 97 行被 !include，早于 addplugindir，所以文件体里不能直接调用
; ${isUpdated}（编译期宏展开会立即触发 plugin 校验）。
; ============================================================================

!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh

; 关闭 NSIS "variable not referenced" warning：nsDialogs 的 SendMessage outvar
; 模式 NSIS 6001 静态分析无法识别为引用，会误报。
; electron-builder 默认 -WX（warnings as errors），不关闭会直接构建失败。
!pragma warning disable 6001

; ----------------------------------------------------------------------------
; 全局变量：页面控件句柄与用户选择
;
; 这些 Var 在 installer.nsh 文件体顶部声明（include 第 97 行），允许；
; 它们不触发 plugin 校验。Function 体放在 customPageAfterChangeDir 宏内
; （第 ~135 行展开），那时 plugin 已注册。
; ----------------------------------------------------------------------------
Var ChkUseCustom
Var ChkAutoStart
Var ChkDesktopShortcut
Var ChkStartMenuShortcut
Var EdtDataDir
Var BtnDataDirBrowse

; 用户最终选择（写文件 / 创建快捷方式时读这些变量）
Var OptUseCustom
Var OptAutoStart
Var OptDesktopShortcut
Var OptStartMenuShortcut
Var OptDataDir

; ----------------------------------------------------------------------------
; customPageAfterChangeDir —— electron-builder 官方钩子
; ----------------------------------------------------------------------------
!macro customPageAfterChangeDir
  ; APP_PRODUCT_FILENAME 仅在 APP_FILENAME != productFilename 时被 electron-builder
  ; 定义。这里做 fallback，保证 $APPDATA 子目录名与 Electron 的
  ; app.getPath('userData') 完全一致。
  !ifdef APP_PRODUCT_FILENAME
    !define APP_USERDATA_DIRNAME "${APP_PRODUCT_FILENAME}"
  !else
    !define APP_USERDATA_DIRNAME "${APP_FILENAME}"
  !endif

  ; 注册一个自定义页面，指定 create / leave 回调
  Page custom CeleryOptionsPageCreate CeleryOptionsPageLeave

  ; ---------- Page create 回调 ----------
  Function CeleryOptionsPageCreate
    ; 升级场景（--updated）下跳过本页
    ; 此时 ${isUpdated} 宏可正常展开（addplugindir 已执行）
    ${if} ${isUpdated}
      Abort
    ${endif}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ; --- 标题（粗体） ---
    ${NSD_CreateLabel} 0 0 100% 16u "选择安装选项"
    Pop $0
    CreateFont $1 "$(^Font)" 12 600
    SendMessage $0 ${WM_SETFONT} $1 0

    ${NSD_CreateLabel} 0 22u 100% 24u "使用默认设置快速安装，或勾选下方选项自定义。$\r$\n若不勾选「使用自定义设置」，下方选项将被忽略。"
    Pop $0

    ; --- 「使用自定义设置」主开关（默认勾选） ---
    ${NSD_CreateCheckbox} 0 58u 100% 12u "使用自定义设置"
    Pop $ChkUseCustom
    ${NSD_Check} $ChkUseCustom
    ${NSD_OnClick} $ChkUseCustom OnUseCustomToggle

    ; --- 子选项区：开机自启（默认不勾选） ---
    ${NSD_CreateCheckbox} 12u 80u 100% 12u "开机时自动启动"
    Pop $ChkAutoStart

    ; --- 子选项区：桌面快捷方式（默认勾选） ---
    ${NSD_CreateCheckbox} 12u 98u 100% 12u "在桌面创建快捷方式"
    Pop $ChkDesktopShortcut
    ${NSD_Check} $ChkDesktopShortcut

    ; --- 子选项区：开始菜单快捷方式（默认勾选） ---
    ${NSD_CreateCheckbox} 12u 116u 100% 12u "在开始菜单创建快捷方式"
    Pop $ChkStartMenuShortcut
    ${NSD_Check} $ChkStartMenuShortcut

    ; --- 子选项区：数据保存位置 ---
    ${NSD_CreateLabel} 12u 140u 100% 10u "数据保存位置："
    Pop $0

    ; 默认显示默认目录（与主进程 getDefaultDataDir 一致）
    ${NSD_CreateText} 12u 154u 270u 14u "$APPDATA\${APP_USERDATA_DIRNAME}\data"
    Pop $EdtDataDir
    ; 只读：必须用「浏览…」按钮选目录，避免手输非法路径
    SendMessage $EdtDataDir ${EM_SETREADONLY} 1 0

    ${NSD_CreateButton} 290u 153u 50u 14u "浏览…"
    Pop $BtnDataDirBrowse
    ${NSD_OnClick} $BtnDataDirBrowse OnBrowseDataDir

    ; 设置默认数据目录（空串表示用主进程默认目录）
    StrCpy $OptDataDir ""

    nsDialogs::Show
  FunctionEnd

  ; ---------- 「使用自定义设置」勾选状态变化 ----------
  Function OnUseCustomToggle
    ${NSD_GetState} $ChkUseCustom $0
    ${If} $0 == ${BST_CHECKED}
      EnableWindow $ChkAutoStart 1
      EnableWindow $ChkDesktopShortcut 1
      EnableWindow $ChkStartMenuShortcut 1
      EnableWindow $EdtDataDir 1
      EnableWindow $BtnDataDirBrowse 1
    ${Else}
      EnableWindow $ChkAutoStart 0
      EnableWindow $ChkDesktopShortcut 0
      EnableWindow $ChkStartMenuShortcut 0
      EnableWindow $EdtDataDir 0
      EnableWindow $BtnDataDirBrowse 0
    ${EndIf}
  FunctionEnd

  ; ---------- 「浏览…」按钮：弹目录选择框 ----------
  Function OnBrowseDataDir
    nsDialogs::SelectFolderDialog "选择数据保存位置" ""
    Pop $0
    ${If} $0 != "error"
    ${AndIf} $0 != ""
      SendMessage $EdtDataDir ${WM_SETTEXT} 0 "STR:$0"
      StrCpy $OptDataDir $0
    ${EndIf}
  FunctionEnd

  ; ---------- Page leave 回调：把选择落到 $OptXxx 变量 ----------
  Function CeleryOptionsPageLeave
    ; 1. 读「使用自定义设置」主开关
    ${NSD_GetState} $ChkUseCustom $OptUseCustom
    ${If} $OptUseCustom == ${BST_CHECKED}
      StrCpy $OptUseCustom "1"
    ${Else}
      StrCpy $OptUseCustom "0"
    ${EndIf}

    ; 没勾主开关：直接返回（install-options.json 不写，主进程走默认）
    ${If} $OptUseCustom == "0"
      Return
    ${EndIf}

    ; 2. 读各复选框状态
    ${NSD_GetState} $ChkAutoStart $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $OptAutoStart "1"
    ${Else}
      StrCpy $OptAutoStart "0"
    ${EndIf}

    ${NSD_GetState} $ChkDesktopShortcut $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $OptDesktopShortcut "1"
    ${Else}
      StrCpy $OptDesktopShortcut "0"
    ${EndIf}

    ${NSD_GetState} $ChkStartMenuShortcut $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $OptStartMenuShortcut "1"
    ${Else}
      StrCpy $OptStartMenuShortcut "0"
    ${EndIf}

    ; 3. 确保 userData 目录存在
    CreateDirectory "$APPDATA\${APP_USERDATA_DIRNAME}"

    ; 4. 写 install-options.json（所有字段都是 ASCII，安全）
    FileOpen $0 "$APPDATA\${APP_USERDATA_DIRNAME}\install-options.json" w
    ${If} $0 != ""
      FileWrite $0 '{"version": 1, "autoStart": $OptAutoStart, "createDesktopShortcut": $OptDesktopShortcut, "createStartMenuShortcut": $OptStartMenuShortcut, "dataDir": "$OptDataDir"}'
      FileClose $0
    ${EndIf}
  FunctionEnd
!macroend

; ----------------------------------------------------------------------------
; customInstall —— electron-builder 在 install 段末尾调用
; 此时 $OptXxx 已在 Page leave 时填好
; ----------------------------------------------------------------------------
!macro customInstall
  ; 仅当用户勾了「使用自定义设置」时才动快捷方式 —— 否则走 electron-builder 默认
  ${If} $OptUseCustom == "1"
    ; 桌面快捷方式
    ${If} $OptDesktopShortcut == "1"
      CreateShortcut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${EndIf}

    ; 开始菜单快捷方式 —— electron-builder 默认会创建，仅在用户取消勾选时删除
    ${If} $OptStartMenuShortcut == "0"
      Delete "$newStartMenuLink"
    ${EndIf}
  ${EndIf}
!macroend

; ----------------------------------------------------------------------------
; customUnInstall —— 卸载段清理桌面快捷方式
; ----------------------------------------------------------------------------
!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
!macroend
