import { _decorator, Component, Node, Prefab, instantiate, Vec3, Material } from 'cc';
import { BlockComponent } from './BlockComponent';
import { ColorType, TrackSide } from './Types';
import { GameManager } from './GameManager';
import { Projectile } from './Projectile';
const { ccclass, property } = _decorator;

@ccclass('GridManager')
export class GridManager extends Component {
    @property(Prefab)
    public blockPrefab: Prefab = null!;

    @property(Prefab)
    public projectilePrefab: Prefab = null!; // Префаб снаряда

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

    @property
    public consumeCooldown: number = 0.2; // Задержка (в секундах) между сбором блоков

    // Хранилище времени последнего сбора для каждой линии
    private lastConsumeTimeMap: Map<string, number> = new Map();

    // Двумерный массив сетки: [row][col]
    private grid: (BlockComponent | null)[][] = [];

    private totalBlocks: number = 0;

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

        this.totalBlocks = this.rows * this.cols;
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

            this.totalBlocks--;

            // Проверяем победу при каждом удалении блока
            if (GameManager.instance) {
                GameManager.instance.checkWin(this.totalBlocks);
            }
        }
    }

    // --- Добавить публичный геттер ---
    public getRemainingBlocksCount(): number {
        return this.totalBlocks;
    }

    public tryConsumeOuterBlock(side: TrackSide, index: number, colorType: ColorType, unitWorldPos: Vec3): boolean {
        const key = `${side}_${index}`;
        const now = Date.now();
        const lastConsumeTime = this.lastConsumeTimeMap.get(key) || 0;

        // Если прошло меньше времени, чем consumeCooldown — отменяем сбор
        if (now - lastConsumeTime < this.consumeCooldown * 1000) {
            return false;
        }

        let targetRow = -1;
        let targetCol = -1;

        switch (side) {
            case TrackSide.BOTTOM: // Находим крайний нижний блок в столбце index (от r = rows - 1 к 0)
                for (let r = this.rows - 1; r >= 0; r--) {
                    if (this.grid[r][index] !== null) {
                        targetRow = r;
                        targetCol = index;
                        break;
                    }
                }
                break;

            case TrackSide.TOP: // Находим крайний верхний блок в столбце index (от r = 0 к rows - 1)
                for (let r = 0; r < this.rows; r++) {
                    if (this.grid[r][index] !== null) {
                        targetRow = r;
                        targetCol = index;
                        break;
                    }
                }
                break;

            case TrackSide.LEFT: // Находим крайний левый блок в строке index (от c = 0 к cols - 1)
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[index][c] !== null) {
                        targetRow = index;
                        targetCol = c;
                        break;
                    }
                }
                break;

            case TrackSide.RIGHT: // Находим крайний правый блок в строке index (от c = cols - 1 к 0)
                for (let c = this.cols - 1; c >= 0; c--) {
                    if (this.grid[index][c] !== null) {
                        targetRow = index;
                        targetCol = c;
                        break;
                    }
                }
                break;
        }

        if (targetRow !== -1 && targetCol !== -1) {
            const block = this.grid[targetRow][targetCol];
            if (block && block.colorType === colorType) {
                const blockWorldPos = block.node.worldPosition.clone();

                // Спавним снаряд. Блок удалится по прилету (callback)
                this.spawnProjectile(unitWorldPos, blockWorldPos, () => {
                this.removeBlock(targetRow, targetCol);
            });
                this.lastConsumeTimeMap.set(key, now); // Запоминаем время сбора
                return true;
            }
        }

        return false;
    }

    private spawnProjectile(startPos: Vec3, targetPos: Vec3, onHit: () => void) {
        if (!this.projectilePrefab) {
            onHit(); // Если префаб не прикреплен в инспекторе — удаляем мгновенно
            return;
        }

        const projNode = instantiate(this.projectilePrefab);
        projNode.setParent(this.node.parent);

        const projComp = projNode.getComponent(Projectile);
        if (projComp) {
            projComp.launch(startPos, targetPos, 0.12, onHit);
        } else {
            onHit();
        }
    }
}