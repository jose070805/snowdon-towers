# Snowdon Towers｜第三阶段语义楼层与模型拆分计划

本计划以稳定项目的 `9f6cd87` 和其 Revit 中间导出为基线。第三阶段可以用源构件定位楼层、恢复原网格并按真实装配关系分离。现有网页场景及动画资产继续作为整楼展示基线。本文的楼层数据结构、按构件组织的几何及交互均为待实现内容。

## 层位与当前覆盖

层位来自 `assets/revit-source/geometry.json` 的 `Level.ProjectElevation` 索引，单位为项目坐标英尺，表中显示到五位小数。正式数据直接保留导出的数值。标高和关系由 A301（P3 p.1 纵剖）、A302–A307（P3 p.2–7）及相应 A/G 平面交叉核对，部分局部 datum 由 Revit 索引补充。P1 p.14 另一张 A301 图还单列结构顶 TOS，其中 L2、L3、L4、L5、R2 比对应楼层 datum 低 6 英寸。只把这组差值用于该图面核对，个别楼板表面和构造厚度按实测记录。

每个数量对是 **独立构件 ID / 未量化三角面**，按源记录的 `level` 统计。**原始**指当前建筑导出类别范围，**可见**指原始数据取 `3D (Shaded) Uncropped`（2248381）可见交集，**网页**指再按现行生成器分类及裁切而保留的源面。最后一列限定源类别 `OST_Floors` 或 `OST_Roofs`，含结构板和饰面等多种用途。含多个材质记录的构件只计一次。层位归属数量与建筑该标高的实际覆盖范围各自独立。

| 语义层键／参考 datum | Revit Level ID | Z（ft） | 原始 | 可见 | 网页 | 楼板／屋顶可见 → 网页 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `parking` | 612792 | −16.91667 | 86 / 6115 | 86 / 6115 | 49 / 571 | 1 / 130 → 0 / 0 |
| `l1:block35` | 593176 | −5.91667 | 193 / 12294 | 183 / 12096 | 180 / 11966 | 13 / 696 → 10 / 566 |
| `l1:block37` | 633454 | −3.45833 | 282 / 11193 | 261 / 10941 | 257 / 10717 | 12 / 598 → 8 / 374 |
| `l1:block43` | 593142 | 0.00000 | 625 / 16434 | 608 / 15650 | 602 / 14803 | 10 / 945 → 4 / 98 |
| `m1` | 828874 | +5.50000 | 28 / 1508 | 28 / 1508 | 28 / 1508 | 1 / 62 → 1 / 62 |
| `l2` | 593177 | +8.08333 | 429 / 18226 | 399 / 16066 | 392 / 15762 | 17 / 814 → 10 / 510 |
| `l3` | 593147 | +18.83333 | 1134 / 53075 | 1090 / 49639 | 1080 / 49195 | 27 / 1144 → 17 / 700 |
| `l4` | 593178 | +32.16667 | 520 / 39128 | 518 / 39076 | 507 / 38534 | 32 / 1334 → 21 / 792 |
| `l5` | 593179 | +45.50000 | 706 / 34330 | 706 / 34330 | 679 / 33110 | 31 / 2777 → 18 / 2065 |
| Block 37 Parapet | 593203 | +47.66667 | 10 / 566 | 9 / 554 | 9 / 554 | 0 / 0 → 0 / 0 |
| Block 43 Parapet | 593204 | +51.16667 | 30 / 71626 | 29 / 71606 | 29 / 71606 | 0 / 0 → 0 / 0 |
| `roof:r1` | 964417 | +52.66667 | 21 / 1302 | 21 / 1302 | 21 / 1302 | 5 / 424 → 5 / 424 |
| Block 39 Parapet | 593205 | +54.66667 | 14 / 37862 | 13 / 37850 | 13 / 37850 | 4 / 224 → 4 / 224 |
| `roof:r2` | 613075 | +58.83333 | 82 / 4676 | 76 / 4604 | 73 / 4532 | 12 / 1856 → 9 / 1784 |
| Green Roof Hardscape | 1925045 | +59.91667 | 89 / 2590 | 89 / 2590 | 17 / 916 | 26 / 1460 → 17 / 916 |
| Parapet | 613240 | +63.50000 | 15 / 940 | 15 / 940 | 15 / 940 | 0 / 0 → 0 / 0 |
| `roof:r3` | 696520 | +68.83333 | 8 / 160 | 8 / 160 | 8 / 160 | 8 / 160 → 8 / 160 |
| Parapet 2 | 696521 | +70.83333 | 7 / 980 | 7 / 980 | 7 / 980 | 0 / 0 → 0 / 0 |
| 无源层位（`level = -1`） | — | — | 242 / 69796 | 228 / 57402 | 164 / 38640 | 0 / 0 → 0 / 0 |
| 合计 | | | **4521 / 382801** | **4374 / 363409** | **4130 / 333646** | **199 / 12624 → 132 / 8675** |

同名可见集含 8,222 个 ID，计入表中的只有找到有效建筑网格的交集。网页按 `group/finish/floor` 烘焙了 141 个表面批次和 61 个边线批次。程序的九级 `FLOORS` 和高度偏差只是当前动画分区，表面批次已经丢失源元素 ID。`snowdon.sdt` 是项目自定义量化资产。`Snowdon-Towers.blend` 是上一版展示网格转换出的可编辑底模，空间检索和按真实构件拆分应从 Revit 中间源开始。

景观另有专项补导，覆盖 137 个原始 ID、73,767 三角面。当前 `landscape.sdl` 有 25 个地表批次、7 个细节批次和 114 个种植点（17 树、97 灌木），分别保留来源 ID。现行动画将地面 10 棵树放在 band −1，将 roof band 4 放 2 树、23 灌木，band 6 放 5 树、74 灌木。band 5 无种植点，仍可有地表和细节；这些分组按底高在 45、52、58 ft 阈值分配。保留其播放逻辑作为过渡，支持屋面关系须重新核证。G106（P4 p.17）的视口关联 R3；植物现有底点和各屋面原始三角面可用来定位不同层级。A106（P2 p.7）给景观分区，A107（P2 p.8）给屋面与坡向，A903（P4 p.5，视图 3–5）用于核对视角和露台关系。

## 数据结构与查询

保留现有 `snowdon.sdt`、`landscape.sdl` 和场地线稿。新增阶段三清单与独立几何分片，按需加载。生成器使用以下可序列化字段，建议对清单写入 Schema 版本并校验交叉引用。

| 记录 | 最少字段及约定 |
| --- | --- |
| `documents` | 持久项目键、源文档名称、源导出文件 SHA-256。后续链接模型同时登记链接实例键与到建筑文档的 4×4 变换。元素键为文档作用域内的字符串 ID；可追加原始 `UniqueId`。同源文档的两个链接实例需要分开的放置键。 |
| `scopes` | `document`、`viewId`、原视图名、可见 ID 哈希、来源及允许用途。`assembled` 绑定 2248381。未来专题可见集单独启用，遵循该范围的 display/phase/link 策略。 |
| `datums`、`levels` | `datums` 存原始 ID、名称、`zFt` 和 `kind`。`levels` 存语义键、子层、有关 datum、图纸/视图键与覆盖状态。`l1` 汇总 Block 35/37/43 三个可独立选择的子层；`m1` 单列；`roof` 汇总 R1、R2、R3。硬质景观 datum 单列支持标高，局部女儿墙 datum 作为部件依据。 |
| `elements` | 作用域内构件键、`sourceLevel`、源类别、`boundsFt`、原始网格 `sourceRanges`、成品 `meshRefs` 和 `statusByScope`。源记录的 `offset`、`size` 是 float32 数值个数，9 个 float 组成一个三角面；网格分片显式声明索引单位、材质和坐标空间。 |
| `memberships` | `element`、`level`、`role`、`confidence`、`evidence`。`role` 可为 `owner`、`touches`、`supportedBy`、`voidContext` 或 `candidate`。`owner` 对同一作用域中的每个真网格只能出现一次。无源层位使用 `null`，有几何推断时另记证据，可回查至原始 `-1`。 |
| `assemblies` | `memberIds`、`ownerLevel` 或 `null`、`linkedLevels`、`motion` 与 `sourceRelations`。连贯外壳或楼梯设 `rigid`，结构板和附属件设 `followSupport`，待核部件设 `referenceOnly`。可记录空洞的来源板/门洞 ID 及图纸证据。 |
| `views`、`coverage` | 图纸 PDF/页/图号、Revit 视图键、独立标记 `boundsStatus`、`geometryStatus`。覆盖状态建议 `available`、`partial`、`drawingOnly`、`unverified`，另存可见但被网页过滤的原因。未来专题加入经核验的相机、投影、剖切盒及房间多边形。 |

最小 JSON 片段展示源构件回查和关联方式。这里的 `confidence` 表示已核实源轮廓范围内该位置的板及层位。经房间或放大平面验证后，才能另建 Retail 108 专用边界。

```json
{
  "schemaVersion": 1,
  "datums": {
    "arch:633454": { "name": "L1 - Block 37", "zFt": -3.458333333333332, "kind": "floor" }
  },
  "levels": {
    "l1:block37": {
      "parent": "l1",
      "datumIds": ["arch:633454"],
      "geometryStatus": "partial"
    }
  },
  "elements": {
    "arch:2114707": {
      "category": "OST_Floors",
      "sourceLevel": "arch:633454",
      "sourceRanges": [
        { "materialId": 18940, "floatOffset": 1792503, "floatCount": 540 },
        { "materialId": 2077616, "floatOffset": 1793043, "floatCount": 180 }
      ],
      "meshRefs": [],
      "statusByScope": { "assembled": "rawVisible", "webBaseline": "excludedByFinishRule" }
    }
  },
  "memberships": [
    {
      "element": "arch:2114707",
      "level": "l1:block37",
      "role": "owner",
      "confidence": "verified",
      "evidence": ["sourceLevel", "G101 P4 p.12 floor elevation sample"]
    }
  ]
}
```

加载时由清单派生 `elementId → meshRefs`、`levelKey → ownership + context` 和 `memberId → assembly` 三个索引。选择 `l1` 时并集包含三个 Block 的已确认构件，去重以放置键为准。选择 `l1:block37` 时，清单会命中 2114707，但这个示例尚无成品 `meshRefs`，前端显示局部来源状态和图纸。如果加载了经允许的真实网格分片，墙、板或门等各自保留原始位姿及材质，查询上下文可高亮或弱化一次渲染的同一构件。爆炸位置由各构件的唯一装配所有者或支持面决定。对同一所有者的网格可按材质合批，保留构件索引及偏移范围，避免为每个源材质记录增加绘制调用。

## 归层、装配与安全缺口

1. **停车与首层。** Parking 源索引有一件楼板 `2134315`，源表面范围含实测 −16.917 ft 地坪，130 面全部被当前网页方案裁掉。现有 49 个按 Parking 层登记且保留到网页的构件只是伸入展示区域的局部几何。提供 A100（P2 p.1）及 G100（P4 p.11）的图纸定位，完整三维车库需要另取已确认的 Architectural 与相应链接可见集。首层保持三个 datum，优先取原视图 Plan Regions/View Range 及对应平面边界。Retail 108 的主门牌在主表 A602（P4 p.2）关联 Block 43，A101 专详表（P1 p.2）将 108.1–3 分列于 Block 37，A401（P1 p.3）还示出不同标高。下展厅饰面 `2114707` 的采样高程 −3.458 ft，筛选规则排除了该 80 面饰面。上展厅 `1423991` 的样点位于 −1.458 ft，124 面在网页。这些局部楼板经图纸定位，并无一整张已核证的 108 网格边界。
2. **M1 与楼板。** M1 是局部夹层。本导出有原层位对应的 28 个构件，其中可见的一件楼板有 62 面；A303（P3 p.3）提供 Commercial Mezzanine Stair 剖面。优先用源 Level、偏置、结构板和饰面层次确认所属楼层，之后核对三角面上表面、下表面和真实开洞。对于楼板和薄饰面，用投影相交及上下接触公差寻找支撑板，保留原材质、厚度和洞口。底部收边、异形坡板需要单独记录；以测量区采样范围表达坡度，用一个 datum 或整件包围盒无法覆盖斜板。L2–L5 可按确认的板件建立第一批语义楼层，表面及隔墙覆盖使用各自状态。
3. **梯塔、大厅与空洞。** A902（P4 p.4）关联 Stair 1–3，命名视图为 789584、789453、686323。三组都有源网格从 Parking 延伸到约 +60.199 ft，但底部构件只留部分三角面。先建立 `stair` 装配，待补 Revit Base/Top Level、偏置、run/landing、栏杆、开洞与电梯关联。`OST_Stairs` 源层位经常为 `-1`；有上下接触块的梯段可以登记为多个层的上下文，某层只驱动其经过验证的所有者。Lobby 106 地坪 `1501152` 在 −2.458 ft；两段具名大厅楼梯 `1556525` / `746421` 与支撑 `1603717` 涉及轴测里的多级带，按 A404（P3 p.11）和 A305（P3 p.5）核对至 L3 +18.833 ft。楼梯、连通空间、电梯井洞口及跨层外墙都登记相邻层关系，保持支撑、栏杆与洞口一致。没有原始开孔语义时保留楼板现存边界，切片处也保留已知的空洞。
4. **复式和相机。** Loft 405 在 A104/A105（P2 p.5–6）及 G104/G105（P4 p.15–16）跨越两层。两处地面样点分别为 `2117374` +32.167 ft（L4）和 `2270387` +43.167 ft（源归 L5，名义 +45.500 ft），48 / 36 源面均被当前网页分类规则排除。候选梯 `2270380` 的原几何 Z 为 +32.167 至 +43.292 ft，楼梯所属房间需视图及四至核对。为复式登记一组与 L4、L5 相交的关系，保留两处真实地面和中间空洞，使用经验证的 Room 边界决定空间可见性。A903（P4 p.5）视图 14 对应 `Loft Unit` 的相机和 405 是否同一空间仍待核实，视图 9/10 的 `Unit 302` 也不能用 A103 的 `Corridor 302` 房间号定位。两组在现阶段可显示同编号图纸和可查原视图 ID。
5. **跨屋顶支持关系。** R1、R2、R3 及 +59.917 ft 硬质地面要保留独立坐标。先以 A106/G106 注册景观区域，再把每个实际屋面构件定位到屋面或 `l5` 退台。草坪、花槽、木台、花架及树灌木优先使用导出的 Host/Level；缺字段时以种植底点和实际顶面相交验证支持屋面，重叠或没有命中标为待查。支撑匹配需检查多个足迹样点，跨相邻不同屋面的设施保留一个拥有者或整组移动。浏览器的上抬约 0.052 ft 景观表皮与程序化树冠用于呈现；清单保留原始高度、个体 ID 和其三角网格来源层，景观附随支持面移动。
6. **斜向 Solar Wall 与开敞退台。** A101/A106（P2 p.2/7）、A201（P2 p.15）、A406（P3 p.13）和 A901（P4 p.3）共同确认前方开敞平台、斜向围护、后部现代体量。可见源例有 `1054635`（`Solar Wall (Multi-Level)`，Level L5，Z +45.500 至 +63.500）、`1054698`、`1054756`，以及光伏 `1054636`、顶部压条 `1970009`。源 `1054770` 登记 L3，却位于约 +13.915 至 +16.138 ft，这类记录用源关联、墙轴和图纸核对。按墙／板／竖梃／端边与压条的宿主关系登记刚性装配，几何允许详看原生分件，其原始倾角、接缝、玻璃/光伏区及无屋顶的前场均要维持。只从已核通过的可见范围取件，交叉专题可见集会引入全楼视图原本隐藏的几何，专题自身的源范围保持独立。

### 截面与坐标

Revit 项目 `(X,Y,Z)`（ft）到 Web 为 `(X+18,Z+6,5−Y)`，反算为 `(x−18,5−z,y−6)`。已注册 A/G 全平面采用 `u=9X+1363.57398, v=−9Y+1058.10869`（PDF pt），适用图纸清单见 `spatial-map.md`。C101 沿用 DXF 矢量的专用注册。A301 的标高能核对剖面竖向位置，构件资产没有源剖切平面或盒子参数。

以后需要剖切专题时，从已有命名视图导出 `GetOrientation`、投影参数、启用状态与 `GetSectionBox` 的 `Transform/Min/Max` 或对应二维范围，外加可见集、链接变换及 Room 边界。精确图纸切片另存带坐标的图纸剖切线及看向；先用现有题图核对至少两个网格锚点和垂直 datum，再启用派生裁切。若使用临时切面，作用在派生显示上且保留原网格和剖切预设。按同一规则裁表面、描边和透明件。三角面集合可能未闭合，只有经验证闭合轮廓方可封切口，洞口阴影和内边须与板或墙洞一起检查。在相机、范围或洞口数据缺失时，可以显示原图和可证实位置，精确剖切功能等对应数据可用后再开放。

## 实施顺序与验收

1. 固定原始文件哈希、可见集和坐标。建立 datum、源构件和覆盖审计，输出证据与未知项。按已核层位和原始网格提取第一批 L2–L5、L1 子层及 R1–R3 板件，不改现有全楼动效使用的批次。首层、M1、Parking 逐层用各自图纸审核范围；车库和未确认室内维持图纸可用状态。
2. 将现有可见范围内的真部件按装配和唯一所有者编为独立分片，细化屋面支持、梯塔、大厅、复式及斜墙。局部饰面恢复只能选经核对的源元素，记录展示基线分类例外和用途。每个分片交付构件清单、未量化输入三角数、量化输出三角数、材质及来源索引。
3. 按需加载楼层交互，按确认装配分离，余量原样保留。全楼阶段仍以原稳定几何和材质渲染。零位移时新增展示按源元件坐标对齐，中断、回滚及重入时能回到同一位姿。跨层高亮可同时由多个楼层命中，渲染和移动只执行一次。
4. 复算覆盖表，检查新生成结果无范围外元素，`meshRefs` 可追到原始材质记录，每个放置键最多一个所有者，矩阵在所属空间间可往返。现有资产量化步长为 1/128 ft，使用该步长作为已量化顶点对照的单轴阈值，独立记录真实轮廓注册误差和超过阈值的简化。按构件计数及位姿验证后，人工复核 A301/A302–A307 的结构关系、A101 Block 37 高差、Loft 局部楼面、G106 景观支撑和 A406 斜幕墙。在组装、分离及恢复状态检查不出现填实板洞、错挪植物、悬空栏杆、重复楼梯或封闭开敞前场。
5. 用原有桌面和移动基准图验证样机既有阶段加载、滚轮进退和布局，证明独立分片只在触发时下载。新增局部功能的发布条件为该层构件覆盖和剖切范围有证据；若仍为 `partial` 或 `drawingOnly`，提供相应图纸或参考轮廓和可查状态。

### 复算方法

下列脚本在稳定项目根目录运行，需要项目生成器使用的 NumPy，只读源文件。输出依次为原始、可见、网页、楼板／屋顶可见和楼板／屋顶网页五组计数，每组 `ID数/三角数`。两份 `OST_Floors`／`OST_Roofs` 计数属于原始建筑导出范围，另一路景观专项数据不计入。比较现有 `tools/prepare_geometry.py` 的 `prepare`、`classify` 和 `display_coordinates`。

| 原始建筑文件 | 核对时的 SHA-256 |
| --- | --- |
| `geometry.json` | `53b7e4a58237d97a043d8999af5fbc6ba1f6d7b39d62b26c6d84de50f96545ab` |
| `assembled-view.json` | `0fd7089c80e5e2e6178b57c56299a1cdda84eb66b26223b458b1326c3f557c76` |
| `triangles.f32.gz` | `f4cedc93c0cbc33e7b3df54ae25ae885e1d60394ac936ebf4da4c141f46ff3b2` |

```python
import collections
import gzip
import json
from pathlib import Path
import sys

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, "tools")
from prepare_geometry import classify, display_coordinates

source = Path("assets/revit-source")
geometry = json.loads((source / "geometry.json").read_bytes())
visible = set(json.loads((source / "assembled-view.json").read_bytes())["ids"])
triangles = np.frombuffer(gzip.decompress((source / "triangles.f32.gz").read_bytes()), "<f4")
levels = {row["id"]: row["z"] for row in geometry["levels"]}
counts = collections.defaultdict(lambda: [[set(), 0] for _ in range(5)])


def count(bucket, element, triangles):
    bucket[0].add(element)
    bucket[1] += triangles


for row in geometry["records"]:
    element, level = row["id"], row["level"]
    bucket = counts[level]
    size, offset = row["size"], row["offset"]
    count(bucket[0], element, size // 9)
    if element not in visible:
        continue
    count(bucket[1], element, size // 9)
    is_floor_or_roof = row["category"] in {"OST_Floors", "OST_Roofs"}
    if is_floor_or_roof:
        count(bucket[3], element, size // 9)
    material = geometry["materials"].get(str(row["material"]), {}).get("name", "").lower()
    if classify(row, material, levels) is None:
        continue
    points = display_coordinates(triangles[offset:offset + size].reshape(-1, 3, 3))
    retained = int(np.count_nonzero(
        (points[:, :, 1].min(1) > -2.25) & (np.abs(points[:, :, 2]).max(1) < 53)
    ))
    if retained:
        count(bucket[2], element, retained)
        if is_floor_or_roof:
            count(bucket[4], element, retained)

for level in [*levels, *[row for row in counts if row not in levels]]:
    print(level, levels.get(level), *(f"{len(ids)}/{faces}" for ids, faces in counts[level]))

for index in range(5):
    buckets = [row[index] for row in counts.values()]
    print("total", index, len(set().union(*(ids for ids, _ in buckets))), sum(faces for _, faces in buckets))
```

资料来源为稳定项目 `work/drawing-review` 下的 `drawing-index.md`、`selected-drawings.md`、`spatial-map.md`、`model-discrepancies.md`，及 `assets/revit-source`、`assets/snowdon.sdt`、`assets/landscape.sdl`、`tools/prepare_geometry.py`、`tools/prepare_landscape.py`。关键视图 ID、图纸命名冲突、链接模型及局部覆盖限制均以相应图纸和原始中间记录为准。
