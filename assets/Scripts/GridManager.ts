import { _decorator, Component, Node, Prefab, instantiate, Vec3, Material } from 'cc';
import { BlockComponent } from './BlockComponent';
import { ColorType, TrackSide } from './Types';
const { ccclass, property } = _decorator;

@ccclass('GridManager')
export class GridManager extends Component {
    @property(Prefab)
    public blockPrefab: Prefab = null!;

    @property(Material)
    public whiteMaterial: Material = null!;

    @property(Material)
    public blackMaterial: Material = null!;

    @property
    public rows: number = 10;

    @property
    public cols: number = 10;

    @property
    public spacing: number = 1.1; // Расстояние между центрами блоков

    // Двумерный массив сетки: [row][col]
    private grid: (BlockComponent | null)[][] = [];

    start() {
        this.generateGrid();
    }

    /**
     * Генерация 2D-сетки блоков в плоскости XZ
     */
    public generateGrid() {
        this.grid = [];

        // Смещение для центрирования сетки в точке (0, 0, 0)
        const offsetX = -((this.cols - 1) * this.spacing) / 2;
        const offsetZ = -((this.rows - 1) * this.spacing) / 2;

        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const blockNode = instantiate(this.blockPrefab);
                blockNode.setParent(this.node);

                // Расставляем по X и Z (Y = 0)
                blockNode.setPosition(new Vec3(offsetX + c * this.spacing, 0, offsetZ + r * this.spacing));

                const blockComp = blockNode.getComponent(BlockComponent);

                // Шахматный порядок цветов (как на референсе)
                // Новый расчет 2x2 (шахматный порядок блоками по 2х2):
                const blockRow = Math.floor(r / 2);
                const blockCol = Math.floor(c / 2);
                const colorType = (blockRow + blockCol) % 2 === 0 ? ColorType.WHITE : ColorType.BLACK;
                const mat = colorType === ColorType.WHITE ? this.whiteMaterial : this.blackMaterial;

                if (blockComp) {
                    blockComp.init(r, c, colorType, mat);
                    this.grid[r][c] = blockComp;
                }
            }
        }
    }

    /**
     * Возвращает самый ВНЕШНИЙ (крайний) доступный блок с заданной стороны
     */
    public getOutermostBlock(side: TrackSide, index: number): BlockComponent | null {
        if (index < 0) return null;

        if (side === TrackSide.BOTTOM) {
            if (index >= this.cols) return null;
            // Сканируем снизу вверх (от 0 до rows - 1) в столбце 'index'
            for (let r = 0; r < this.rows; r++) {
                if (this.grid[r][index]) return this.grid[r][index];
            }
        } else if (side === TrackSide.TOP) {
            if (index >= this.cols) return null;
            // Сканируем сверху вниз (от rows - 1 до 0) в столбце 'index'
            for (let r = this.rows - 1; r >= 0; r--) {
                if (this.grid[r][index]) return this.grid[r][index];
            }
        } else if (side === TrackSide.LEFT) {
            if (index >= this.rows) return null;
            // Сканируем слева направо (от 0 до cols - 1) в строке 'index'
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[index][c]) return this.grid[index][c];
            }
        } else if (side === TrackSide.RIGHT) {
            if (index >= this.rows) return null;
            // Сканируем справа налево (от cols - 1 до 0) в строке 'index'
            for (let c = this.cols - 1; c >= 0; c--) {
                if (this.grid[index][c]) return this.grid[index][c];
            }
        }

        return null;
    }

    /**
     * Удаляет блок из массива и со сцены
     */
    public removeBlock(row: number, col: number) {
        const block = this.grid[row][col];
        if (block) {
            this.grid[row][col] = null;
            block.node.destroy();
        }
    }

    /**
 * Попытка поглотить крайний блок с указанной стороны и индекса
 * @returns true, если блок был успешно поглощен
 */
public tryConsumeOuterBlock(side: TrackSide, index: number, colorType: ColorType): boolean {
    let targetRow = -1;
    let targetCol = -1;

    switch (side) {
        case TrackSide.BOTTOM: // Находим крайний нижний блок в столбце index
            for (let r = this.rows - 1; r >= 0; r--) {
                if (this.grid[r][index] !== null) {
                    targetRow = r;
                    targetCol = index;
                    break;
                }
            }
            break;

        case TrackSide.TOP: // Находим крайний верхний блок в столбце index
            for (let r = 0; r < this.rows; r++) {
                if (this.grid[r][index] !== null) {
                    targetRow = r;
                    targetCol = index;
                    break;
                }
            }
            break;

        case TrackSide.LEFT: // Находим крайний левый блок в строке index
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[index][c] !== null) {
                    targetRow = index;
                    targetCol = c;
                    break;
                }
            }
            break;

        case TrackSide.RIGHT: // Находим крайний правый блок в строке index
            for (let c = this.cols - 1; c >= 0; c--) {
                if (this.grid[index][c] !== null) {
                    targetRow = index;
                    targetCol = c;
                    break;
                }
            }
            break;
    }

    // Если нашли открытый крайний блок
    if (targetRow !== -1 && targetCol !== -1) {
        const block = this.grid[targetRow][targetCol];
        if (block && block.colorType === colorType) {
            block.node.destroy();
            this.grid[targetRow][targetCol] = null;
            return true;
        }
    }

    return false;
}
}