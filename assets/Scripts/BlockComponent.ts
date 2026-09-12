import { _decorator, Component, MeshRenderer, Material, Enum } from 'cc';
const { ccclass, property } = _decorator;

export enum ColorType {
    WHITE = 0,
    BLACK = 1
}

Enum(ColorType);

@ccclass('BlockComponent')
export class BlockComponent extends Component {
    @property({ type: ColorType })
    public colorType: ColorType = ColorType.WHITE;

    @property(Material)
    public whiteMaterial: Material | null = null;

    @property(Material)
    public blackMaterial: Material | null = null;

    public row: number = -1;
    public col: number = -1;

    public init(row: number, col: number, colorType: ColorType) {
        this.row = row;
        this.col = col;
        this.setColor(colorType);
    }

    public setColor(colorType: ColorType) {
        this.colorType = colorType;
        const meshRenderer = this.getComponent(MeshRenderer);
        if (!meshRenderer) return;

        if (colorType === ColorType.WHITE && this.whiteMaterial) {
            meshRenderer.material = this.whiteMaterial;
        } else if (colorType === ColorType.BLACK && this.blackMaterial) {
            meshRenderer.material = this.blackMaterial;
        }
    }
}