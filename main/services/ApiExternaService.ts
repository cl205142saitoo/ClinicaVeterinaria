import axios from 'axios';
import nodemailer from 'nodemailer';

export class ApiExternaService {
  // API 1: Cotação do Dólar em tempo real (AwesomeAPI)
  async obterCotacaoDolar(): Promise<number> {
    const { data } = await axios.get('https://economia.awesomeapi.com.br/last/USD-BRL');
    return parseFloat(data.USDBRL.bid);
  }

  // API 2: Envio de E-mail real com link de visualização (Nodemailer + Ethereal)
  async enviarEmailNotificacao(destinatario: string, assunto: string, mensagem: string) {
    const contaTeste = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: contaTeste.user,
        pass: contaTeste.pass,
      },
    });

    const info = await transporter.sendMail({
      from: '"Clínica Vet MVP" <contato@clinicavet.com>',
      to: destinatario,
      subject: assunto,
      text: mensagem,
    });

    return {
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info),
    };
  }

  // API 3: Busca de imagem aleatória de cão (Dog CEO API)
  async buscarFotoCao(): Promise<string> {
    const { data } = await axios.get('https://dog.ceo/api/breeds/image/random');
    return data.message;
  }
}