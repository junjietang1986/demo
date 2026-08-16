# TRAC SoLo 设备开发质量管理平台 · 产品架构规划 v1.0

> 对标 Siemens Teamcenter + IBS QMS Automotive，适配 VDA6.4/VDA6.7/IATF16949，面向德系车企一级设备供应商（年营收5亿+大型自动化设备/整线集成商）
> 规划基准日期：2026-07-06

---

## 一、产品定位

**TRAC SoLo** = 非标自动化设备开发全生命周期的「项目管理 + 质量管理 + 合规审核」一体化平台，核心价值：

1. **APQP项目驱动**：以设备开发项目为主线，串联机械/电气/软件三大专业的交付物
2. **VDA6.4 体系合规**：内置质量体系文件、内审/外审、CAPA、供应商审核、TISAX信息安全
3. **VDA6.7 过程审核**：按设备开发全工序（机械设计→电气设计→软件→采购→装配→调试→FAT→SAT）打分管控
4. **AIAG-VDA 新版 FMEA**：DFMEA/PFMEA 七步法，与 DVP&R、控制计划联动
5. **PPAP/MSA/SPC 全链条**：覆盖设备交付到客户产线的质量验证闭环
6. **8D/CAPA 问题闭环**：所有异常、审核不符合项、客户投诉统一走8D/CAPA流程

---

## 二、现有系统基线（已完成）

### 2.1 已有功能模块

| 模块 | 核心能力 | 文件 |
|---|---|---|
| 用户/部门/权限 | 角色管理、部门树、数据权限 | [users.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/users.ts)、[permissions.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/permissions.ts) |
| 项目立项 | 项目CRUD、关联产品/工位/CE物料 | [projects.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/projects.ts) |
| 项目计划/WBS | 树形任务、甘特图、模板、版本快照、审批、撤销重做 | [plans.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/plans.ts)、[ProjectPlan.tsx](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/client/src/pages/ProjectPlan.tsx) |
| 审批工作流 | 可配置审批流程、多级审批、飞书审批推送 | [approval.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/approval.ts) |
| 验收管理 | 验收配置（类型/项目）、验收计划、验收单 | [acceptance.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/acceptance.ts) |
| 持续改进/8D雏形 | 改进记录、措施、根因分析 | [improvement.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/improvement.ts) |
| QMS现场记录 | OPL单点课、过程异常/巡检记录 | [qms.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/qms.ts) |
| CE物料管理 | CE物料登记、附件 | [ce_materials.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/ce_materials.ts) |
| 交付物管理 | 文件附件、版本、审批关联 | 嵌入projects/plans |
| 导入导出/版本 | Excel导入导出、document_versions通用版本快照 | [impexp.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/impexp.ts) |
| 飞书集成 | 消息推送、审批推送、文件上传 | [feishu.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/feishu.ts) |
| 报表看板 | Dashboard、统计报表 | [reports.ts](file:///f:/TRAC%20SoLo推理过程资料/设备开发管理系统/server/src/routes/reports.ts) |

### 2.2 已有数据库表（共约23张）

基础：`users`、`departments`、`roles`、`permissions`、`system_configs`
项目：`projects`、`workstations`、`project_plans`、`plan_tasks`、`deliverables`
审批：`approval_flows`、`approval_records`、`approval_step_records`
QMS：`opl_records`、`anomaly_records`、`improvements`、`improvement_attachments`
验收：`acceptance_configs`、`acceptance_forms`、`acceptance_form_items`、`acceptance_attachments`、`acceptance_plans`、`acceptance_plan_items`
版本：`document_versions`、`import_batches`、`ce_materials`、`ce_material_attachments`

### 2.3 技术栈

- **后端**：Node.js + Express + better-sqlite3（单文件嵌入式数据库，适合部门级部署）
- **前端**：React 18 + TypeScript + Ant Design 5 + Vite
- **甘特图**：自定义SVG甘特组件（已实现）
- **集成**：飞书开放平台（消息/审批/文件）
- **认证**：JWT + bcrypt

---

## 三、目标功能架构全景

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRAC SoLo 平台                            │
├─────────────────────────────────────────────────────────────────┤
│  门户层：Dashboard · 消息中心 · 我的待办 · 飞书工作台              │
├────────────┬────────────┬────────────┬────────────┬─────────────┤
│  项目管理域 │  质量管理域 │  过程审核域 │  生产件域  │  体系合规域 │
├────────────┼────────────┼────────────┼────────────┼─────────────┤
│ APQP阶段门 │ DFMEA      │ VDA6.7审核 │ PPAP提交包 │ VDA6.4体系  │
│ WBS/甘特   │ PFMEA      │ 乌龟图     │ MSA分析    │ 内审/管评   │
│ BOM物料    │ DVP&R      │ 工序打分   │ SPC管控    │ 供应商审核  │
│ ECR/ECO    │ 控制计划CP │ 审核报告   │ 尺寸报告   │ CAPA管理    │
│ 资源负荷   │ 特殊特性   │ 改进跟踪单 │ 材料报告   │ TISAX合规   │
│ 图纸版本   │            │            │ PSW保证书  │ 体系文件    │
│            │            │            │ Run@Rate   │ 客户审核    │
├────────────┴────────────┴────────────┴────────────┴─────────────┤
│  平台支撑层：审批引擎 · 文档版本 · 消息通知 · 导入导出 · 权限RBAC │
│            附件存储 · 操作日志 · 飞书集成 · 报表引擎              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、模块详细设计

### 4.1 APQP 五阶段项目管理（升级现有项目模块）

#### 4.1.1 目标
将现有「项目立项+WBS计划」升级为 APQP（产品质量先期策划）五阶段门控管理，适配非标设备开发。

#### 4.1.2 APQP 五阶段设备开发适配

| 阶段 | 名称 | 设备开发对应阶段 | 核心交付物 | 门控评审 |
|---|---|---|---|---|
| Phase 1 | 计划和确定项目 | 投标/需求分析/方案设计 | 客户需求清单、技术方案、可行性评估、BOM初步清单、风险评估 | 合同评审（Order Review） |
| Phase 2 | 产品设计和开发 | 机械/电气/软件详细设计 | 3D模型（SolidWorks）、2D图纸、电气原理图（EPLAN）、软件需求规格书、DFMEA、DVP&R、特殊特性清单 | 设计评审（Design Review） |
| Phase 3 | 过程设计和开发 | 工艺/采购/制造准备 | 装配工艺卡、检验规范、PFMEA、控制计划CP、作业指导书、量具清单、供应商APQP状态 | 过程评审（Process Review） |
| Phase 4 | 产品和过程确认 | 装配/调试/FAT/SAT | 设备调试记录、MSA报告、SPC初始研究、能力研究Cmk、PPAP文件包、Run@Rate节拍验证 | 出厂验收（FAT） |
| Phase 5 | 反馈评定和纠正 | 发运/现场安装/SOP/售后 | 现场安装记录、SAT报告、问题清单、经验教训、保修记录、客户满意度 | 量产放行（SOP Release） |

#### 4.1.3 核心功能
- **阶段门控（Phase Gate）**：每个阶段结束必须通过门控评审才能进入下一阶段
  - 门控检查清单（Gate Checklist）：列出该阶段必须完成的所有交付物
  - 门控评审会议：评审意见、签字、状态（通过/有条件通过/不通过）
- **阶段交付物矩阵**：每个阶段绑定必须提交的交付物清单（与 deliverables 表现有关联）
- **项目健康度仪表**：红黄绿状态（进度/成本/质量/风险四象限）
- **资源负荷视图**：按工程师/部门查看任务负荷，超负荷预警
- **里程碑管理**：关键里程碑日期、偏差分析
- **项目模板**：按设备类型（如装配线/测试台/焊接站/机器人单元）预置APQP模板

#### 4.1.4 数据模型扩展
- `projects` 表扩展字段：`apqp_phase`（当前阶段1-5）、`project_type`（设备类型分类）、`customer_id`（客户）、`customer_requirements`（客户需求文本）、`feasibility_status`（可行性状态）、`health_status`（健康度）
- 新增 `apqp_phases`：阶段定义表
- 新增 `apqp_gates`：门控评审记录
- 新增 `apqp_gate_checklists`：门控检查项
- 新增 `apqp_deliverables_matrix`：阶段-交付物映射（可按设备类型配置）
- 新增 `project_risks`：项目风险登记册（FMEA风险之外的项目级风险）
- 新增 `resource_allocations`：资源分配记录（人员/设备/工位）
- 新增 `lessons_learned`：经验教训库（项目关闭时录入）

---

### 4.2 FMEA 失效模式与影响分析（AIAG-VDA 新版七步法）

#### 4.2.1 目标
实现 DFMEA（设计FMEA）和 PFMEA（过程FMEA），严格遵循 AIAG-VDA 2019 新版七步法，与 DVP&R、控制计划、特殊特性联动。

#### 4.2.2 七步法

| 步骤 | DFMEA | PFMEA |
|---|---|---|
| 1. 规划和准备 | FMEA策划、边界图、BOM | 过程流程图、FMEA策划 |
| 2. 结构分析 | 设计结构树（系统→子系统→零件→要素） | 过程结构树（过程→工步→作业要素） |
| 3. 功能分析 | 功能网（功能-要求-产品特性） | 功能网（过程功能-产品特性-过程特性） |
| 4. 失效分析 | 失效网（失效后果-失效模式-失效原因） | 失效网（失效后果-失效模式-失效原因） |
| 5. 风险分析 | S/O/D评分、AP措施优先级 | S/O/D评分、AP措施优先级 |
| 6. 优化 | 措施定义、责任人、完成日期、状态 | 措施定义、责任人、完成日期、状态 |
| 7. 结果文件化 | FMEA报告、DVP&R关联 | FMEA报告、控制计划关联 |

#### 4.2.3 评分规则（AIAG-VDA 新版1-10分）
- **S（严重度Severity）**：1-10分，失效后果的严重程度（10分最严重，涉及安全/法规）
- **O（发生度Occurrence）**：1-10分，失效原因发生的频率
- **D（探测度Detection）**：1-10分，现行控制探测失效的能力
- **AP（Action Priority）**：措施优先级（H高/M中/L低），通过S/O/D组合矩阵自动计算

#### 4.2.4 核心功能
- **结构树可视化**：树形展示系统-子系统-零件（DFMEA）或过程-工步（PFMEA）
- **功能网/失效网图形化**：节点连线展示功能-失效链
- **自动AP计算**：内置AIAG-VDA官方AP矩阵，选择S/O/D后自动计算H/M/L
- **特殊特性标识**：关键特性（CC）、重要特性（SC）、符号标识（如倒三角S、菱形ST）
- **DVP&R联动**：DFMEA失效原因→DVP&R验证项目
- **控制计划CP联动**：PFMEA失效原因→控制计划控制方法
- **FMEA模板库**：按设备类型预置DFMEA/PFMEA模板
- **版本管理**：复用document_versions机制，FMEA每次变更保存版本
- **FMEA-MSR（监控和系统响应）**：可选，针对设备软件/控制系统
- **导出**：FMEA表格Excel、FMEA报告PDF（含结构树/功能网图形）

#### 4.2.5 数据模型
- `fmeas`：FMEA主表（类型dfmea/pfmea、关联项目、版本、状态）
- `fMEA_structure_nodes`：结构树节点
- `fmea_functions`：功能/要求
- `fmea_failures`：失效链（后果/模式/原因）
- `fmea_actions`：优化措施
- `fmea_special_characteristics`：特殊特性
- `fmea_templates`/`fmea_template_nodes`...：模板库

---

### 4.3 DVP&R 设计验证计划与报告

#### 4.3.1 目标
管理设备验证试验，从DFMEA失效模式自动生成验证项目，跟踪试验执行和结果。

#### 4.3.2 核心功能
- **DVP&R表格**：标准DVP&R字段
  - 试验编号、试验名称、关联失效模式/特殊特性
  - 试验标准/规范、试验方法、接收准则
  - 样件阶段（A样/B样/C样/OTS/PPAP）、样本量
  - 负责部门/责任人、计划完成日期、实际完成日期
  - 试验结果（Pass/Fail）、试验报告编号、备注
- **从DFMEA自动导入**：失效原因→DVP&R验证项
- **试验阶段管理**：A样（原型）/B样（工程样机）/C样（生产件）/OTS（工装样件）/PPAP
- **试验报告上传**：每个试验项可上传试验报告附件
- **DVP&R状态仪表盘**：按阶段统计完成率、通过率
- **与FMEA双向联动**：FMEA中可查看对应验证项状态

#### 4.3.3 数据模型
- `dvpr_plans`：DVP&R计划主表（关联项目）
- `dvpr_items`：验证项目行
- `dvpr_results`：试验结果记录（支持多次试验）

---

### 4.4 控制计划（Control Plan）

#### 4.4.1 目标
实现AIAG标准控制计划，与PFMEA联动，是PPAP必须交付物。

#### 4.4.2 核心功能
- **控制计划三阶段**：Prototype（样件）、Pre-launch（试生产）、Production（量产）
- **标准控制计划表**：
  - 过程名称/操作编号、设备/工装、特性编号
  - 产品特性、过程特性、特殊特性分类（CC/SC）
  - 产品/过程规范/公差、评价测量技术、样本量/频率
  - 控制方法、反应计划
- **从PFMEA自动导入**：失效原因→控制计划行
- **与作业指导书关联**：控制项→对应作业指导书
- **版本控制**：每次更新保留历史版本

#### 4.4.3 数据模型
- `control_plans`：控制计划主表（阶段、关联项目/零件）
- `control_plan_items`：控制计划行项

---

### 4.5 BOM 物料清单管理

#### 4.5.1 目标
管理设备BOM（EBOM→MBOM→SBOM），关联图纸版本，支持ECR/ECO变更。

#### 4.5.2 BOM类型
- **EBOM（工程BOM）**：设计输出，从SolidWorks/EPLAN导入，按设计层级
- **MBOM（制造BOM）**：工艺规划输出，增加工装/辅料/虚拟件，按装配顺序
- **SBOM（服务BOM）**：售后备件BOM
- **采购BOM**：外购件清单，关联供应商信息

#### 4.5.3 核心功能
- **BOM树形编辑器**：可视化多层级BOM，支持拖拽调整
- **BOM差异对比**：两个版本BOM差异高亮显示（增/删/改）
- **BOM版本管理**：每次变更生成新版本
- **物料主数据**：物料编码、名称、规格、材质、单位、分类（机械/电气/标准件/外购件/软件）、图号
- **BOM导入**：支持从SolidWorks BOM Excel、EPLAN导出清单导入
- **BOM查询**：反查（某物料用在哪些设备）、正查（单台BOM展开）、汇总BOM（用量汇总）
- **与项目关联**：每个项目绑定设备BOM，BOM变更触发ECR

#### 4.5.4 数据模型
- `materials`：物料主数据
- `material_categories`：物料分类
- `boms`：BOM主表（类型、版本、关联项目/产品）
- `bom_items`：BOM行（父子关系、数量、位号、备注）
- `material_suppliers`：物料-供应商关系（首选/备选供应商、采购价格）

---

### 4.6 ECR/ECO 工程变更管理

#### 4.6.1 目标
建立工程变更流程：变更申请（ECR）→评审→变更执行（ECO）→通知→验证→关闭。

#### 4.6.2 变更流程
```
ECR提出 → ECR评审（CCB变更控制委员会）→ 批准后创建ECO → 执行变更（改图/改BOM/改FMEA/改程序）
→ 变更验证 → 变更通知（各部门）→ 关闭
```

#### 4.6.3 核心功能
- **ECR申请单**：变更原因（客户要求/设计错误/工艺优化/降本/质量问题）、变更影响分析（影响哪些图纸/BOM/FMEA/在制品/库存）、紧急程度
- **CCB评审**：评审流程（复用现有审批引擎）、评审意见、签字
- **ECO执行单**：关联ECR，列出所有受影响对象（图纸/BOM/FMEA/控制计划/程序/作业指导书），责任人签字
- **变更影响矩阵**：自动分析变更影响范围
- **变更通知（ECN）**：批准后自动生成变更通知单，推送相关部门
- **变更追溯**：所有变更历史可查，BOM/图纸/文件版本链可追溯
- **紧急变更**：允许先执行后补流程（红色标签流程）

#### 4.6.4 数据模型
- `ecr_requests`：ECR变更申请
- `eco_orders`：ECO变更指令
- `eco_affected_items`：受影响对象清单
- `ecn_notices`：变更通知
- `ecr_approvals`：复用approval_records

---

### 4.7 VDA6.7 设备过程审核

#### 4.7.1 目标
原生搭载VDA6.7（2023版）过程审核标准，针对设备/工装制造过程进行量化审核。

#### 4.7.2 VDA6.7 核心要素
VDA6.7问卷分为以下过程要素（设备开发全工序）：

| 要素代码 | 要素名称 | 对应设备开发过程 |
|---|---|---|
| P1 | 潜在供方分析 | 投标/供应商选择阶段 |
| P2 | 项目管理 | 项目启动到SOP |
| P3 | 策划和开发支持 | 方案/详细设计阶段 |
| P4 | 产品和过程开发的实现 | 机械/电气/软件开发 |
| P5 | 供应商管理 | 采购/外包 |
| P6 | 过程分析 | 核心：分6个子要素 |
| P6.1 | 过程输入 | 设计输入/订单输入 |
| P6.2 | 过程管理 | 项目管理/设计过程 |
| P6.3 | 人力资源 | 人员资质/培训 |
| P6.4 | 物质资源 | 设备/工装/软件/IT |
| P6.5 | 过程效果/效率 | KPI/持续改进 |
| P6.6 | 过程结果 | 交付结果/质量 |
| P7 | 客户服务/满意度/服务 | 售后/SAT/保修 |

#### 4.7.3 评分体系
- 每个问题评分：0分（不符合）、4分（大部分不符合）、6分（部分符合）、8分（大部分符合）、10分（完全符合）
- 降级规则：当出现带*号（关键）问题时，整个要素降级
- EPG（过程符合率）计算：各要素加权评分
- 分级结果：≥90分A级，≥80分B级，≥70分C级，<70分D级

#### 4.7.4 乌龟图（Turtle Diagram）
每个过程要素提供乌龟图模板，六维度分析：
```
        输入（Input）─── 使用什么资源（Resources/Material）
           │                   │
   谁来做（Personnel）── 过程名称 ── 用何方法（Methods/Procedures）
           │                   │
        输出（Output）─── 如何衡量（Performance/Indicators）
```

#### 4.7.5 核心功能
- **VDA6.7问卷库**：内置完整VDA6.7标准问卷（约80-100个问题），支持自定义问题
- **审核计划**：年度审核计划、审核员分配、审核日程
- **审核执行**：现场打分、证据上传（照片/文件）、不符合项记录、乌龟图填写
- **自动评分计算**：录入分数后自动计算EPG、等级
- **审核报告自动生成**：按VDA6.7标准格式生成PDF审核报告（含评分矩阵、乌龟图、问题清单、改进计划）
- **改进跟踪单**：每个不符合项生成跟踪单，关联8D/CAPA流程
- **审核趋势**：多次审核得分趋势图
- **供应商审核**：复用同一框架对供应商做过程审核
- **版本管理**：问卷库版本化，历史审核保留原始问卷快照

#### 4.7.6 数据模型
- `audit_plans`：审核计划
- `audits`：审核主表（类型vda67/供应商/内审、状态、审核日期、审核组长/组员）
- `audit_checklists`：问卷库/检查表模板
- `audit_questions`：检查问题（支持按版本快照）
- `audit_answers`：审核回答（评分、证据、备注、符合/不符合）
- `audit_turtle_diagrams`：乌龟图记录
- `audit_nc_items`：不符合项
- `audit_reports`：审核报告
- `auditor_qualifications`：审核员资质

---

### 4.8 VDA6.4 体系管理

#### 4.8.1 目标
建立IATF16949 + VDA6.4 质量管理体系数字化管理。

#### 4.8.2 子模块

**A. 体系文件管理（Document Control）**
- 文件层级：质量手册（Level 1）→程序文件（Level 2）→作业指导书SOP/WI（Level 3）→表单记录（Level 4）
- 文件全生命周期：起草→评审→批准→发布→培训→执行→复审→作废
- 文件版本控制：版本号（如A/0、A/1、B/0）、修订记录、新旧版本对照
- 文件分发：发布后自动通知相关部门，签收确认
- 外来文件管理：客户标准、法规（VDA/DIN/ISO/IATF）、行业标准
- **关联图纸管理**：SolidWorks/EPLAN图纸作为技术文件统一管控

**B. 内部审核（Internal Audit）**
- 年度审核方案：体系审核、过程审核（复用VDA6.7）、产品审核的计划安排
- 审核实施：检查表、现场记录、不符合项、审核报告
- 跟踪验证：不符合项纠正措施验证关闭

**C. 管理评审（Management Review）**
- 管理评审计划、输入（质量目标/审核结果/客户反馈/过程绩效/纠正预防/以往跟踪/改进建议/变更/资源需求）
- 评审会议记录、输出（决议/改进措施）、跟踪

**D. CAPA 纠正预防措施**
- CAPA来源：内审不符合、外审不符合、客户投诉、过程异常、8D、管理评审
- CAPA流程：问题识别→紧急遏制→根因分析（5Why/鱼骨图）→纠正措施→预防措施→效果验证→标准化
- CAPA与8D一体化：CAPA可转8D，8D关闭后自动关闭关联CAPA
- **升级现有improvement模块**为CAPA+8D整合模块

**E. 供应商准入审核**
- 供应商分类：原材料/标准件/加工件/电气件/外包服务
- 供应商准入流程：潜在供应商自评→现场审核（VDA6.3适配供应商）→样品认可→列入合格供方名录（AVL）
- 供应商分级：A/B/C/D级，年度复评
- 供应商绩效：质量（PPM）/交付（准时率）/服务/价格评分
- 供应商PPAP要求：对关键零部件供应商要求提交PPAP

**F. TISAX 信息安全合规**
- TISAX评估等级：AL1/AL2/AL3
- 信息安全控制项：信息安全政策、人力资源安全、资产管理、访问控制、加密、物理安全、运行安全、通信安全、采购/供应商关系、事件管理、业务连续性、合规
- 信息资产清单：硬件/软件/数据/文档/人员/服务
- 风险评估：资产→威胁→脆弱性→风险→控制措施
- 审核准备：VDA ISA问卷自评估

**G. 客户审核支持**
- 客户审核日程、陪审安排
- 客户提出问题跟踪、回复
- 客户特殊要求（CSR）管理：各大车企（VW/BMW/Daimler/Bosch/Siemens）特殊要求库

#### 4.8.3 数据模型
- `qms_documents`：体系文件
- `qms_document_revisions`：文件版本
- `document_distributions`：文件分发签收
- `internal_audits`：内审计划/记录（复用audit表扩展类型）
- `management_reviews`：管理评审
- `capa_records`：CAPA记录（重构improvements表）
- `suppliers`：供应商主数据
- `supplier_assessments`：供应商评价
- `supplier_audits`：供应商审核
- `tisax_assets`：TISAX信息资产
- `tisax_controls`：TISAX控制项
- `customer_special_requirements`：客户特殊要求
- `customer_audits`：客户审核

---

### 4.9 PPAP 生产件批准程序（设备交付）

#### 4.9.1 目标
设备出厂/交付客户时的PPAP提交包管理，参照AIAG PPAP第四版，适配设备类产品。

#### 4.9.2 PPAP 18项交付物（设备适配版）

| # | PPAP要素 | 设备开发对应物 | 关联模块 |
|---|---|---|---|
| 1 | 设计记录（Design Records） | 机械/电气/软件图纸（BOM+图纸） | BOM/图纸 |
| 2 | 工程变更文件（ECN） | ECR/ECO记录 | ECR/ECO |
| 3 | 客户工程批准（Customer Engineering Approval） | 客户设计会签 | 项目 |
| 4 | DFMEA | 设计FMEA | FMEA |
| 5 | PFMEA | 过程FMEA（装配/调试） | FMEA |
| 6 | 过程流程图（Process Flow Diagram） | 装配/调试流程图 | APQP |
| 7 | 控制计划（Control Plan） | 设备检验/运行控制计划 | CP |
| 8 | MSA研究（Measurement System Analysis） | 设备上量具的MSA | MSA |
| 9 | 尺寸结果（Dimensional Results） | 设备关键尺寸检测报告 | 验收 |
| 10 | 材料/性能试验结果 | 关键零部件材料证明、性能测试报告 | CE物料/DVP&R |
| 11 | 初始过程研究（Initial Process Studies） | 设备Cmk能力研究 | SPC |
| 12 | 合格实验室文件 | 校准证书、实验室资质 | MSA |
| 13 | 外观批准报告（AAR） | 设备外观验收记录（如适用） | 验收 |
| 14 | 样件生产件（Sample Product） | 设备样机记录/照片 | 项目 |
| 15 | 标准样品（Master Sample） | 首件封样 | 验收 |
| 16 | 检具/辅助工装（Checking Aids） | 专用检具/测试工装清单 | BOM |
| 17 | 客户特殊要求符合性（CSR） | 客户特殊要求完成确认 | VDA6.4 |
| 18 | PSW零件提交保证书 | 设备出厂保证书/合格证 | PPAP |

#### 4.9.3 提交等级
- Level 1：PSW只提交保证书
- Level 2：PSW + 产品样品 + 部分数据
- Level 3：PSW + 产品样品 + 完整数据（最常用）
- Level 4：PSW + 客户指定要求
- Level 5：PSW + 产品样品 + 完整数据 + 现场评审

#### 4.9.4 核心功能
- **PPAP包管理**：为每个项目创建设备PPAP包，自动汇总18项交付物状态
- **交付物状态跟踪**：每项待提交/已提交/客户批准/客户拒绝
- **PSW自动生成**：填写设备信息、材料声明、外观批准等后自动生成PSW表单PDF
- **PPAP Run@Rate**：节拍验证记录（额定产能/实际产能/持续时间/结果）
- **PPAP提交审批**：内部审批后提交客户，记录客户批准状态（批准/临时批准/拒绝）
- **PPAP状态仪表盘**：所有项目PPAP完成率、批准状态

#### 4.9.5 数据模型
- `ppap_packages`：PPAP包主表（关联项目、提交等级、客户批准状态）
- `ppap_elements`：PPAP要素状态（18项，每项状态/提交记录/客户反馈）
- `ppap_psw`：PSW保证书数据
- `ppap_run_rate`：Run@Rate记录
- `ppap_submissions`：提交历史

---

### 4.10 MSA 测量系统分析

#### 4.10.1 目标
管理设备上所有测量系统的分析，确保测量数据可信。

#### 4.10.2 分析类型
- **偏倚（Bias）**：测量值与参考值的差异
- **线性（Linearity）**：全量程内偏倚的变化
- **稳定性（Stability）**：时间维度上的测量偏差
- **重复性（Repeatability）**：同一人多次测量变差
- **再现性（Reproducibility）**：不同人测量变差
- **GRR（Gage R&R）**：重复性+再现性合成
  - 交叉法（Crossed）：破坏性/非破坏性
  - 嵌套法（Nested）：破坏性试验
- **属性一致性分析（Attribute Agreement）**：Pass/Fail类量具的Kappa分析

#### 4.10.3 判定标准
- GRR % < 10%：可接受
- 10% ≤ GRR % ≤ 30%：条件接受（取决于应用）
- GRR % > 30%：不可接受，须改进
- ndc（区分分类数）≥ 5

#### 4.10.4 核心功能
- **量具台账**：量具编号、名称、类型、量程、精度、校准周期、位置、状态
- **MSA计划**：按量具制定年度MSA计划（哪些量具做哪些分析、频率）
- **数据录入**：按模板录入测量数据（支持Excel导入）
- **自动计算**：
  - GRR：均值极差法（Xbar-R）/方差分析法（ANOVA），自动输出EV/AV/PV/GRR/%Contribution/ndc
  - 偏倚：t检验
  - 线性：回归分析、线性图
  - 稳定性：Xbar-R控制图
  - 属性一致性：Kappa系数、一致性比率
- **MSA报告**：自动生成MSA报告（含控制图、判定结论）
- **校准管理**：量具校准周期、校准记录、校准证书上传、到期提醒
- **MSA不通过预警**：GRR>30%自动触发纠正措施流程（关联CAPA）

#### 4.10.5 数据模型
- `gages`：量具/测量设备台账
- `gage_calibrations`：校准记录
- `msa_plans`：MSA计划
- `msa_studies`：MSA分析主表（类型/量具/日期/结论）
- `msa_data_points`：测量数据点
- `msa_results`：分析结果（各统计量）

---

### 4.11 SPC 统计过程控制

#### 4.11.1 目标
对设备加工/运行过程的关键特性进行统计过程控制，发现异常波动。

#### 4.11.2 适用场景（设备行业）
- 关键零部件加工尺寸（外协/自制件检测数据）
- 设备装配精度检测
- 设备运行参数（压力/温度/速度/扭矩/力值）
- 调试阶段过程参数
- 客户现场SOP后数据跟踪

#### 4.11.3 控制图类型

| 数据类型 | 控制图 |
|---|---|
| 计量值（连续） | Xbar-R（均值-极差，子组<9）、Xbar-S（均值-标准差，子组≥9）、I-MR（单值-移动极差，子组=1） |
| 计数值（计件） | p图（不合格品率）、np图（不合格品数） |
| 计数值（计点） | c图（缺陷数）、u图（单位缺陷数） |

#### 4.11.4 判异规则（Nelson Rules/ Western Electric）
支持8大判异规则可配置：
1. 1点超出3σ
2. 连续9点在中心线同侧
3. 连续6点递增或递减
4. 连续14点上下交替
5. 连续3点中有2点在2σ外同侧
6. 连续5点中有4点在1σ外同侧
7. 连续15点在1σ内（分层问题）
8. 连续8点在中心线两侧但无一点在1σ内

#### 4.11.5 过程能力
- **Cmk**：机器能力指数（设备新购进/大修后，短期能力，≥1.67）
- **Cp/Cpk**：过程能力指数（稳定过程，Ppk≥1.67/1.33）
- **Pp/Ppk**：过程性能指数（初始过程/PPAP，≥1.67）

#### 4.11.6 核心功能
- **质量特性定义**：关键特性（CTQ）、规格上下限（USL/LSL）、目标值、子组大小、采样频率
- **数据采集**：手动录入/Excel导入/预留API对接检测设备
- **控制图绘制**：实时控制图，异常点红色标记，触发判异规则时高亮提示
- **过程能力分析**：直方图+正态曲线、Cp/Cpk/Pp/Ppk/Cmk计算、判定结论
- **异常报警**：触发判异规则时自动通知责任人，触发OOC/OCAP流程
- **SPC看板**：关键特性实时监控大屏
- **历史分析**：按月/周分析过程稳定性趋势
- **与FMEA/CP联动**：控制计划中的控制方法标记为"SPC"的特性自动进入SPC监控列表

#### 4.11.7 数据模型
- `spc_characteristics`：质量特性定义（关联项目/过程/零件）
- `spc_data_points`：测量数据点
- `spc_subgroups`：子组（计量值）
- `spc_alarm_rules`：判异规则配置
- `spc_alarms`：异常报警记录
- `spc_capability_studies`：过程能力研究记录

---

### 4.12 8D 问题解决（升级现有improvement模块）

#### 4.12.1 目标
将现有improvement模块升级为完整的8D问题解决流程，与CAPA、VDA6.7不符合项、SPC报警、客户投诉统一入口。

#### 4.12.2 8D 八个步骤
- D0：问题响应/紧急遏制（是否需要8D评估、ERA紧急响应措施）
- D1：组建团队（组长、成员、跨部门）
- D2：问题描述（5W2H：What/When/Where/Who/Why/How/How many、Is/Is Not分析）
- D3：临时遏制措施（ICA）
- D4：根因分析（5Why、鱼骨图、故障树分析FTA，区分发生根因/流出根因）
- D5：永久纠正措施（PCA选择+验证）
- D6：实施并验证PCA
- D7：预防再发生（系统性预防、标准化、水平展开）
- D8：团队表彰/关闭

#### 4.12.3 核心功能
- **8D工作台**：按步骤填写，每步有状态（未开始/进行中/完成/跳过）
- **问题描述5W2H表单**：结构化录入
- **5Why可视化**：逐层填写Why链，展示5Why树形图
- **鱼骨图模板**：人/机/料/法/环/测六维度分析
- **措施验证**：措施必须有验证证据才能关闭
- **8D来源关联**：可从VDA6.7不符合项、SPC报警、客户投诉、内审不符合、异常记录直接创建8D
- **8D报告导出**：标准8D报告PDF/Excel
- **措施超时预警**：超过计划完成日期未关闭自动提醒/升级
- **与CAPA双向联动**：8D D4/D5/D6/D7自动同步到CAPA

#### 4.12.4 数据模型（重构现有improvements表）
- `eight_d_records`：8D主表（替代/扩展improvements）
- `eight_d_steps`：各步骤记录（D0-D8）
- `eight_d_actions`：措施（遏制/纠正/预防）
- `eight_d_team_members`：团队成员
- `eight_d_attachments`：附件（复用已有）
- `capa_links`：CAPA关联

---

### 4.13 资源管理（升级现有workstations）

#### 4.13.1 核心功能
- **资源类型**：人员（工程师/技师/审核员）、设备/工位、检测仪器（关联MSA量具）、软件许可
- **资源日历**：工作日历、假期、排班
- **资源分配**：项目任务分配资源，记录工作量（人天）
- **资源负荷图**：按人/部门/时间维度显示负荷率，>100%红色预警
- **人员技能矩阵**：按技能（机械设计/电气设计/PLC编程/机器人调试/审核员...）登记技能等级，自动匹配合适人员
- **人员资质证书**：审核员证、焊工证、电工证、VDA6.7审核员证、TÜV证书等，到期提醒

#### 4.13.2 数据模型扩展
- `resources`：资源统一台账（含现有workstations、新增人员/软件资源）
- `resource_skills`：技能库
- `resource_skill_matrix`：人员-技能矩阵
- `resource_certifications`：资质证书
- `resource_calendar`：资源日历
- `resource_allocations`：资源分配（项目-任务-资源-时间段-工作量）

---

## 五、数据库设计（新增表清单）

### 5.1 核心新增表汇总（约60张）

| 模块 | 新增表 |
|---|---|
| APQP升级 | apqp_phases、apqp_gates、apqp_gate_checklists、apqp_deliverables_matrix、project_risks、lessons_learned、customers |
| FMEA | fmeas、fmea_structure_nodes、fmea_functions、fmea_failures、fmea_actions、fmea_special_characteristics、fmea_templates、fmea_template_nodes... |
| DVP&R | dvpr_plans、dvpr_items、dvpr_results |
| 控制计划 | control_plans、control_plan_items、cp_templates... |
| BOM | materials、material_categories、boms、bom_items、material_suppliers |
| ECR/ECO | ecr_requests、eco_orders、eco_affected_items、ecn_notices |
| VDA6.7审核 | audit_plans、audits、audit_checklists、audit_questions、audit_answers、audit_turtle_diagrams、audit_nc_items、audit_reports、auditor_qualifications |
| VDA6.4体系 | qms_documents、qms_document_revisions、document_distributions、management_reviews、capa_records、suppliers、supplier_assessments、supplier_audits、tisax_assets、tisax_controls、customer_special_requirements、customer_audits |
| PPAP | ppap_packages、ppap_elements、ppap_psw、ppap_run_rate、ppap_submissions |
| MSA | gages、gage_calibrations、msa_plans、msa_studies、msa_data_points、msa_results |
| SPC | spc_characteristics、spc_data_points、spc_subgroups、spc_alarm_rules、spc_alarms、spc_capability_studies |
| 8D升级 | eight_d_records、eight_d_steps、eight_d_actions、eight_d_team_members |
| 资源管理 | resources、resource_skills、resource_skill_matrix、resource_certifications、resource_calendar、resource_allocations |

### 5.2 数据库设计原则
1. **所有业务表**统一字段：`id`、`created_at`、`updated_at`、`created_by`、`updated_by`、`deleted_at`（软删除）
2. **所有可审计对象**统一接入 `document_versions` 版本快照（复用现有机制）
3. **所有需审批对象**统一通过 `approval_flows`/`approval_records` 走审批流（复用现有审批引擎）
4. **所有业务对象**可挂附件（通过统一附件表，或复用各模块的*_attachments表）
5. **使用外键逻辑**（better-sqlite3不强制外键，通过应用层维护完整性）

---

## 六、菜单导航结构

```
TRAC SoLo
├── 📊 工作台（Dashboard）
│   ├── 我的待办（审批/任务/8D/CAPA/审核/量具到期）
│   ├── 项目看板（健康度/进度/阶段）
│   ├── 质量看板（SPC/8D/审核/PPAP）
│   └── 消息中心
│
├── 📋 项目管理（升级）
│   ├── 项目列表
│   │   └── 项目详情（含APQP阶段门/BOM/FMEA/DVP&R/CP/PPAP/8D/验收/SPC标签页）
│   ├── 项目计划（现有，升级甘特图+资源负荷）
│   ├── 计划模板（现有）
│   ├── 资源负荷（新）
│   ├── 里程碑看板（新）
│   ├── 经验教训库（新）
│   └── 客户管理（新）
│
├── 🔧 工程数据（新）
│   ├── BOM管理
│   │   ├── 物料主数据
│   │   ├── BOM版本
│   │   └── BOM对比
│   ├── FMEA管理
│   │   ├── DFMEA
│   │   ├── PFMEA
│   │   ├── FMEA模板库
│   │   └── 特殊特性清单
│   ├── DVP&R验证计划
│   ├── 控制计划
│   ├── 图纸文件管理（SolidWorks/EPLAN）
│   └── 工程变更ECR/ECO
│
├── ✅ 质量管理（升级现有QMS）
│   ├── QMS现场记录
│   │   ├── OPL单点课（现有）
│   │   └── 过程异常（现有）
│   ├── SPC统计过程控制（新）
│   │   ├── 质量特性定义
│   │   ├── 控制图监控
│   │   ├── 过程能力分析
│   │   └── SPC报警
│   ├── MSA测量系统分析（新）
│   │   ├── 量具台账
│   │   ├── 校准管理
│   │   └── MSA分析
│   ├── 8D问题解决（升级现有持续改进）
│   └── CAPA纠正预防（新）
│
├── 📝 验收管理（现有保留）
│   ├── 验收配置（现有）
│   ├── 验收计划（现有）
│   └── 验收单（现有）
│
├── 📦 PPAP交付（新）
│   ├── PPAP包管理
│   ├── PSW保证书
│   └── Run@Rate节拍验证
│
├── 🎯 过程审核（新）
│   ├── VDA6.7过程审核
│   │   ├── 审核计划
│   │   ├── 审核执行
│   │   ├── 审核报告
│   │   └── 改进跟踪
│   ├── 问卷库/检查表模板
│   └── 乌龟图模板库
│
├── 📚 体系管理（新）
│   ├── 体系文件（质量手册/程序/SOP/表单）
│   ├── 内部审核
│   ├── 管理评审
│   ├── 供应商管理
│   │   ├── 合格供方名录
│   │   ├── 供应商准入审核
│   │   ├── 供应商绩效
│   │   └── 供应商PPAP
│   ├── 客户特殊要求（CSR）
│   ├── 客户审核
│   └── TISAX信息安全
│
├── 📈 报表中心（升级现有）
│   ├── 项目报表
│   ├── 质量报表（8D/CAPA/SPC/审核/PPAP）
│   ├── 供应商报表
│   └── 自定义报表
│
├── ⚙️ 系统管理（现有扩展）
│   ├── 用户管理（现有）
│   ├── 部门管理（现有）
│   ├── 权限配置（现有）
│   ├── 审批流程配置（现有）
│   ├── 飞书配置（现有）
│   ├── 基础数据（新增：技能/物料分类/客户/部门）
│   ├── 导入导出（现有）
│   └── 操作日志（新增）
```

---

## 七、角色权限矩阵

| 角色 | 关键权限 |
|---|---|
| 系统管理员 | 全部权限、系统配置、用户/权限管理 |
| 质量经理/管理者代表 | VDA6.4体系、内审/管评、CAPA审批、PPAP批准、FMEA审批、质量报表 |
| 项目经理 | 项目全流程、APQP门控、资源分配、计划编制、8D/D2-D7主导 |
| 机械/电气/软件工程师 | 本专业BOM编辑、DFMEA分析、图纸上传、DVP&R执行、控制计划 |
| 工艺工程师 | PFMEA、控制计划、SPC特性定义、MSA计划、作业指导书 |
| 质量工程师 | SPC执行、MSA执行、8D主导、审核参与、PPAP文件整理、进货检验 |
| 采购/供应商管理 | 供应商准入、供应商评价、采购BOM、供应商PPAP |
| 生产/装配主管 | 装配执行、PFMEA执行、控制计划执行、SPC数据采集 |
| 调试工程师 | 调试记录、DVP&R试验执行、FAT/SAT验收、设备SPC数据 |
| 售后/客服 | 客户投诉、现场SAT、保修记录、客户审核陪审 |
| 审核员（VDA6.7） | 审核计划执行、审核打分、不符合项开具（不可改其他数据） |
| 部门经理 | 本部门资源、审批本部门措施、本部门绩效查看 |
| 客户/外部审核员（受限） | 仅查看指定PPAP/项目/审核相关数据（只读受限视图） |

---

## 八、实施路线图（分4期，约6-8个月）

### 第一期：APQP+FMEA+ECR/ECO 核心骨架（约6-8周）
**目标**：把项目管理从「计划+验收」升级为APQP工程管理主线
1. APQP五阶段门控（Phase Gate）+阶段交付物矩阵+项目健康度
2. 客户管理+项目基础数据升级
3. FMEA七步法（DFMEA+PFMEA）——核心难点，需最细致开发
4. 特殊特性管理
5. 物料主数据+BOM管理（EBOM树形编辑器+BOM版本+BOM导入）
6. ECR/ECO工程变更流程（复用审批引擎）
7. ProjectDetail页面重构为多Tab（APQP/BOM/FMEA/DVP&R/CP/PPAP/8D/SPC/验收/版本）
8. 资源管理（人员技能矩阵+资源负荷视图基础版）

### 第二期：VDA6.7过程审核+8D/CAPA+DVP&R+控制计划（约6周）
**目标**：建立过程审核和问题闭环能力
1. VDA6.7问卷库内置（完整100+题）
2. 审核计划+审核执行+乌龟图+打分+自动EPG计算
3. 审核报告自动生成（PDF）
4. 不符合项→8D/CAPA联动
5. 现有improvement模块重构为8D（D0-D8）
6. CAPA模块
7. DVP&R设计验证计划（从DFMEA自动导入）
8. 控制计划（从PFMEA自动导入）
9. 图纸/技术文件管理（SolidWorks/EPLAN）

### 第三期：PPAP+MSA+SPC+验收升级（约8周）
**目标**：打通设备交付质量验证全链条
1. PPAP包管理（18项交付物跟踪+PSW自动生成）
2. Run@Rate节拍验证
3. MSA量具台账+校准管理+GRR（Xbar-R/ANOVA）+偏倚+线性+稳定性+属性一致性
4. MSA报告自动生成
5. SPC质量特性定义+数据采集+Xbar-R/Xbar-S/I-MR/p/c/u控制图
6. Nelson判异规则+异常报警+OOC流程
7. Cmk/Cpk/Ppk过程能力计算
8. SPC实时看板
9. 升级现有验收模块：尺寸报告录入、性能试验结果、关联SPC/MSA数据

### 第四期：VDA6.4体系+供应商管理+TISAX+报表完善（约6-8周）
**目标**：体系合规和供应商管理
1. 体系文件管理（四级文件+版本+分发+签收）
2. 内部审核（复用VDA6.7审核框架）
3. 管理评审
4. 供应商主数据+准入审核+绩效评价+分级+合格供方名录
5. 客户特殊要求（CSR）库
6. 客户审核支持
7. TISAX信息安全自评估（简化版）
8. 经验教训库
9. 综合报表升级（项目/质量/供应商/审核/PPAP/SPC）
10. 飞书深度集成（通知/待办/审批/文档同步）

---

## 九、与现有系统集成点

| 新模块 | 复用现有 | 扩展/重构 |
|---|---|---|
| APQP项目 | 现有projects表、plan_tasks（WBS）、deliverables、甘特图 | projects表加apqp_phase等字段，ProjectDetail新增Tab |
| FMEA | document_versions版本快照、approval审批、附件 | 全新表、全新页面 |
| VDA6.7审核 | approval审批、document_versions、用户/部门 | 审核框架可抽象为通用审核引擎（后续内审/供应商审核复用） |
| 8D | 重构improvement表、improvement_attachments | improvements升级为eight_d_records结构（保持向后兼容或迁移） |
| ECR/ECO | approval审批引擎、document_versions | 全新 |
| PPAP | 现有acceptance验收数据、deliverables交付物 | 全新，验收数据作为PPAP输入 |
| MSA | 现有workstations（可关联为量具位置） | 全新 |
| SPC | 现有anomaly_records（SPC报警可生成异常记录） | 全新，统计计算引擎在后端实现 |
| CAPA | 现有approval | 全新，和8D双向联动 |
| 供应商 | 现有departments扩展或独立suppliers表 | 全新 |
| 资源负荷 | 现有plan_tasks（assignee_id）、users、workstations | 扩展plan_tasks增加工作量字段，新增资源分配表 |

---

## 十、技术选型补充

### 10.1 统计计算（MSA/SPC）
- **后端（Node.js）**：自己实现统计函数（均值/标准差/方差/协方差/回归/t检验/GRR计算）
  - 算法参考：NIST/SEMATECH e-Handbook of Statistical Methods
  - 不建议引入R/Python，保持单技术栈部署简单
- **前端图表**：继续用Ant Design Charts / ECharts（控制图、直方图、能力图、趋势图）
- **FMEA结构树/失效网**：Ant Design Tree + 自定义SVG连线，或引入 `reactflow`（节点连线图）

### 10.2 PDF导出
- 继续使用 jspdf + html2canvas（已在项目中引入）
- 复杂报告（VDA6.7审核报告/FMEA报告/PPAP PSW/8D报告/MSA报告）预定义HTML模板，html2canvas转PDF

### 10.3 Excel导入导出
- 继续使用 xlsx（SheetJS），已在impexp模块中使用

### 10.4 BOM/FMEA结构树大数据量优化
- 树形数据懒加载（BOM可能上千行）
- 虚拟滚动（react-window 或 Ant Design Table virtual）

### 10.5 部署
- 保持单Node.js进程+单SQLite文件的极简部署模式（适配设备供应商IT能力）
- 后续数据量增大可平滑迁移到PostgreSQL（数据访问层预留抽象）

---

## 十一、关键业务规则

### 11.1 数据联动规则
- DFMEA失效原因 → 自动生成DVP&R验证项
- PFMEA失效原因 → 自动生成控制计划行
- 控制计划中控制方法=SPC → 自动创建SPC监控特性
- 控制计划中测量系统 → 自动进入MSA计划
- VDA6.7不符合项 → 可一键生成8D
- SPC报警（OOC）→ 可一键生成异常记录→8D
- 客户投诉 → 可一键生成8D
- ECR批准 → 自动创建ECO，ECO关闭后BOM/图纸/FMEA/CP自动升版
- PPAP提交前检查 → 18项交付物必须全部"已提交"才能内部审批
- PPAP中MSA/SPC项 → MSAGR%<30%、Ppk≥1.67才能标记"已提交"
- FMEA AP=H → 必须有措施，措施未关闭FMEA不能批准

### 11.2 版本控制规则
- 所有主业务对象（项目计划/FMEA/BOM/控制计划/体系文件/图纸）每次保存保留版本快照
- 版本号规则：
  - 计划/PPAP包：V01/V02/V03...（已实现）
  - 体系文件：A/0（初版）→ A/1（小改）→ B/0（大改）
  - BOM/FMEA：V1.0/V1.1/V2.0
- 审批通过版本标记为"已生效版本"（is_current）

### 11.3 权限管控规则
- 主计划只有编制者/项目经理可修改（已实现）
- FMEA只有FMEA主持人（FMEA Moderator）可关闭
- VDA6.7审核员只能打分和开不符合项，不能改其他业务数据
- ECR/ECO必须通过CCB评审才能生效
- PPAP必须质量经理会签才能提交客户
- SPC控制限一旦建立，修改需走变更流程

---

## 十二、首期开发任务清单（待用户确认后即开始实施）

首期优先级（P0必须，P1重要，P2可选）：

| 序号 | 任务 | 优先级 | 估计工作量 |
|---|---|---|---|
| 1 | projects表扩展APQP字段+客户表+APQP阶段配置 | P0 | 0.5天 |
| 2 | ProjectDetail页重构为多Tab骨架（预留BOM/FMEA/DVP&R/CP/PPAP/8D/SPC/验收/版本Tab） | P0 | 1天 |
| 3 | APQP阶段门控（Gate）UI+逻辑 | P0 | 2天 |
| 4 | 物料主数据CRUD+分类 | P0 | 1天 |
| 5 | BOM树形编辑器（EBOM）+导入+版本 | P0 | 3天 |
| 6 | FMEA数据模型+后端API | P0 | 2天 |
| 7 | FMEA前端七步法UI（结构树→功能→失效→风险→措施） | P0 | 5天 |
| 8 | FMEA AP自动计算+特殊特性标识 | P0 | 1天 |
| 9 | ECR/ECO流程（后端+前端） | P0 | 3天 |
| 10 | 人员技能矩阵+资源负荷视图 | P1 | 2天 |
| 11 | 项目健康度+里程碑看板 | P1 | 1.5天 |
| 12 | DVP&R基础版（可关联FMEA失效） | P1 | 2天 |
| 13 | 控制计划基础版（可关联PFMEA） | P1 | 2天 |

**首期合计：约26人天**

---

## 附录：术语表

| 术语 | 含义 |
|---|---|
| APQP | Advanced Product Quality Planning，产品质量先期策划 |
| PPAP | Production Part Approval Process，生产件批准程序 |
| FMEA | Failure Mode and Effects Analysis，失效模式与影响分析 |
| DFMEA | Design FMEA，设计FMEA |
| PFMEA | Process FMEA，过程FMEA |
| DVP&R | Design Verification Plan and Report，设计验证计划与报告 |
| CP | Control Plan，控制计划 |
| MSA | Measurement System Analysis，测量系统分析 |
| SPC | Statistical Process Control，统计过程控制 |
| GRR | Gage Repeatability and Reproducibility，量具重复性和再现性 |
| Cmk/Cpk/Ppk | 机器能力/过程能力/过程性能指数 |
| ECR/ECO/ECN | Engineering Change Request/Order/Notice，工程变更申请/指令/通知 |
| BOM | Bill of Materials，物料清单（EBOM工程/MBOM制造/SBOM服务） |
| CAPA | Corrective and Preventive Action，纠正预防措施 |
| 8D | 8 Disciplines，8D问题解决法 |
| VDA6.4 | VDA卷6.4，生产设备质量管理体系审核 |
| VDA6.7 | VDA卷6.7，过程审核（设备/工装制造） |
| VDA6.3 | VDA卷6.3，过程审核（批量生产，供应商审核用） |
| IATF16949 | 汽车行业质量管理体系标准 |
| TISAX | Trusted Information Security Assessment Exchange，汽车行业信息安全评估 |
| FAT/SAT | Factory Acceptance Test/Site Acceptance Test，出厂/现场验收 |
| PSW | Part Submission Warrant，零件提交保证书 |
| Run@Rate | 节拍验证/产能验证 |
| CSR | Customer Specific Requirements，客户特殊要求 |
| AVL | Approved Vendor List，合格供方名录 |
| CCB | Change Control Board，变更控制委员会 |
| CC/SC | Critical Characteristic/Significant Characteristic，关键/重要特性 |
| CTQ | Critical to Quality，关键质量特性 |
| OCAP | Out-of-Control Action Plan，失控应对计划 |
| OTS | Off Tooling Sample，工装样件 |

---

*文档版本：v1.0 · 规划日期：2026-07-06 · 后续按此规划逐模块实施*
